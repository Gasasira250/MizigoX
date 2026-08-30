import {
  availabilityForDriverStatus,
  availabilityForVehicleStatus,
  canTransitionRoute,
  canTransitionShipment,
  isRouteStructurallyLocked,
  weightToKg,
  type DriverStatus,
  type RouteEventPayload,
  type RoutePayload,
  type RouteShipmentPayload,
  type RouteStatus,
  type RouteStopPayload,
  type RouteStopType,
  type RouteType,
  type ShipmentStatus,
  type VehicleStatus,
} from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { insertAddress, toNumber } from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { applyOperatorFilter, assertOperatorAccess } from '../fleet/tenant.js';
import type { z } from 'zod';
import type {
  createRouteSchema,
  listRoutesQuerySchema,
  routeStopInputSchema,
  updateRouteSchema,
  updateRouteStatusSchema,
} from './route.schemas.js';

type CreateRouteInput = z.infer<typeof createRouteSchema>;
type UpdateRouteInput = z.infer<typeof updateRouteSchema>;
type ListRoutesQuery = z.infer<typeof listRoutesQuerySchema>;
type StatusInput = z.infer<typeof updateRouteStatusSchema>;
type StopInput = z.infer<typeof routeStopInputSchema>;

const SORT_COLUMNS = {
  reference: 'r.reference',
  status: 'r.status',
  plannedDepartureAt: 'r.planned_departure_at',
  plannedArrivalAt: 'r.planned_arrival_at',
  updatedAt: 'r.updated_at',
} as const;

const ASSIGNABLE_VEHICLE_STATUSES = new Set(['ACTIVE', 'AVAILABLE']);
const ASSIGNABLE_DRIVER_STATUSES = new Set(['ACTIVE', 'AVAILABLE']);

export async function createRoute(pool: Pool, actor: AuthContext, input: CreateRouteInput) {
  const organizationId = await resolveRouteOrganization(pool, actor, input.organizationId);
  const initialStatus = (input.status ?? 'DRAFT') as RouteStatus;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (input.vehicleId) {
      await assertVehicleAssignable(client, organizationId, input.vehicleId, undefined, false);
    }
    if (input.driverId) {
      await assertDriverAssignable(client, organizationId, input.driverId, undefined, false);
    }
    for (const shipmentId of input.shipmentIds) {
      await assertShipmentAssignable(client, actor, organizationId, shipmentId);
    }

    const reference = await nextRouteReference(client);
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO routes (
          reference, organization_id, status, route_type, planned_departure_at,
          planned_arrival_at, distance_km, estimated_duration_minutes, notes,
          vehicle_id, driver_id, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `,
      [
        reference,
        organizationId,
        initialStatus,
        input.routeType,
        input.plannedDepartureAt ?? null,
        input.plannedArrivalAt ?? null,
        input.distanceKm ?? null,
        input.estimatedDurationMinutes ?? null,
        input.notes ?? null,
        input.vehicleId ?? null,
        input.driverId ?? null,
        actor.userId,
      ],
    );
    const routeId = created.rows[0]?.id;
    if (!routeId) {
      throw new Error('Failed to create route');
    }

    for (const shipmentId of input.shipmentIds) {
      await client.query(
        `
          INSERT INTO route_shipments (route_id, shipment_id, organization_id)
          VALUES ($1, $2, $3)
        `,
        [routeId, shipmentId, organizationId],
      );
    }

    if (input.stops?.length) {
      let sequence = 1;
      for (const stop of input.stops) {
        await insertStop(client, organizationId, routeId, sequence, stop);
        sequence += 1;
      }
    } else {
      await seedStopsFromShipments(client, organizationId, routeId, input.shipmentIds);
    }
    await refreshRouteEndpoints(client, routeId);
    await insertRouteEvent(client, {
      routeId,
      organizationId,
      type: 'CREATED',
      status: initialStatus,
      description: `Route ${reference} created`,
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: 'ROUTE_CREATED',
      entityType: 'route',
      entityId: routeId,
      after: { reference, status: initialStatus, shipmentIds: input.shipmentIds },
    });
    return loadRoute(pool, actor, routeId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRoutes(pool: Pool, actor: AuthContext, query: ListRoutesQuery) {
  const params: unknown[] = [];
  const where = ['r.deleted_at IS NULL'];
  applyRouteVisibility(actor, where, params, 'r.organization_id', 'r.id');

  if (query.status) {
    params.push(query.status);
    where.push(`r.status::text = $${params.length}`);
  }
  if (query.driverId) {
    params.push(query.driverId);
    where.push(`r.driver_id = $${params.length}`);
  }
  if (query.vehicleId) {
    params.push(query.vehicleId);
    where.push(`r.vehicle_id = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`r.planned_departure_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`r.planned_departure_at <= $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(r.reference) LIKE $${params.length} OR lower(coalesce(r.origin_text, '')) LIKE $${params.length} OR lower(coalesce(r.destination_text, '')) LIKE $${params.length})`,
    );
  }

  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM routes r WHERE ${where.join(' AND ')}`,
    params,
  );
  const sortColumn = SORT_COLUMNS[query.sort];
  const sortDirection = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT r.id
      FROM routes r
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, r.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const routes = await Promise.all(result.rows.map((row) => loadRoute(pool, actor, row.id)));
  return {
    routes,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadRoute(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
): Promise<RoutePayload> {
  const result = await pool.query(
    `
      SELECT
        r.id, r.reference, r.organization_id, o.name AS organization_name,
        r.status::text AS status, r.route_type::text AS route_type,
        r.origin_text, r.destination_text, r.planned_departure_at, r.planned_arrival_at,
        r.actual_departure_at, r.actual_arrival_at, r.dispatched_at, r.distance_km,
        r.estimated_duration_minutes, r.notes, r.vehicle_id, r.driver_id,
        r.created_by_user_id, r.created_at, r.updated_at,
        NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS created_by_name,
        v.reference AS vehicle_reference, v.registration_number, v.status::text AS vehicle_status,
        v.payload_capacity, v.payload_unit::text AS payload_unit,
        d.reference AS driver_reference, d.first_name, d.last_name, d.phone_e164,
        d.status::text AS driver_status
      FROM routes r
      JOIN organizations o ON o.id = r.organization_id
      LEFT JOIN users creator ON creator.id = r.created_by_user_id
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      LEFT JOIN drivers d ON d.id = r.driver_id
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `,
    [routeId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('Route not found');
  }
  await assertRouteAccess(pool, actor, String(row.organization_id), routeId);

  const [shipments, stops, events] = await Promise.all([
    pool.query(
      `
        SELECT rs.id, s.id AS shipment_id, s.reference, s.status::text AS status,
               c.name AS customer_name, s.weight_kg, s.volume_m3, s.pieces_count
        FROM route_shipments rs
        JOIN shipments s ON s.id = rs.shipment_id
        JOIN organizations c ON c.id = s.customer_organization_id
        WHERE rs.route_id = $1
        ORDER BY s.created_at
      `,
      [routeId],
    ),
    pool.query(
      `
        SELECT id, route_id, sequence, stop_type::text AS stop_type, status::text AS status,
               shipment_id, address_id, formatted_address, contact_name, contact_phone_e164,
               planned_arrival_at, actual_arrival_at, planned_departure_at, actual_departure_at,
               instructions, latitude, longitude, notes
        FROM route_stops
        WHERE route_id = $1 AND deleted_at IS NULL
        ORDER BY sequence
      `,
      [routeId],
    ),
    pool.query(
      `
        SELECT e.id, e.event_type, e.previous_status::text AS previous_status,
               e.status::text AS status, e.description, e.actor_user_id, e.location_label,
               e.latitude, e.longitude, e.metadata, e.occurred_at,
               NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
        FROM route_events e
        LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.route_id = $1
        ORDER BY e.occurred_at ASC
      `,
      [routeId],
    ),
  ]);

  const shipmentRefs = new Map(
    shipments.rows.map((item) => [String(item.shipment_id), String(item.reference)]),
  );
  const mappedShipments: RouteShipmentPayload[] = shipments.rows.map((item) => ({
    id: String(item.id),
    shipmentId: String(item.shipment_id),
    reference: String(item.reference),
    status: String(item.status),
    customerName: String(item.customer_name),
    weightKg: toNumber(item.weight_kg as string | null),
    volumeM3: toNumber(item.volume_m3 as string | null),
    piecesCount: (item.pieces_count as number | null) ?? null,
  }));
  const cargoWeightKg = mappedShipments.reduce((sum, item) => sum + (item.weightKg ?? 0), 0);
  const cargoVolumeM3 = mappedShipments.reduce((sum, item) => sum + (item.volumeM3 ?? 0), 0);
  const vehicleCapacityKg = weightToKg(
    toNumber(row.payload_capacity as string | null),
    (row.payload_unit as string | null) ?? 'KG',
  );

  return {
    id: String(row.id),
    reference: String(row.reference),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name),
    status: row.status as RouteStatus,
    routeType: row.route_type as RouteType,
    origin: (row.origin_text as string | null) ?? null,
    destination: (row.destination_text as string | null) ?? null,
    plannedDepartureAt: toIso(row.planned_departure_at as Date | null),
    plannedArrivalAt: toIso(row.planned_arrival_at as Date | null),
    actualDepartureAt: toIso(row.actual_departure_at as Date | null),
    actualArrivalAt: toIso(row.actual_arrival_at as Date | null),
    dispatchedAt: toIso(row.dispatched_at as Date | null),
    distanceKm: toNumber(row.distance_km as string | null),
    estimatedDurationMinutes: (row.estimated_duration_minutes as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    vehicleReference: (row.vehicle_reference as string | null) ?? null,
    vehicleRegistration: (row.registration_number as string | null) ?? null,
    vehicleCapacityKg,
    vehicleStatus: (row.vehicle_status as string | null) ?? null,
    driverId: (row.driver_id as string | null) ?? null,
    driverReference: (row.driver_reference as string | null) ?? null,
    driverName:
      row.first_name && row.last_name ? `${String(row.first_name)} ${String(row.last_name)}` : null,
    driverPhone: (row.phone_e164 as string | null) ?? null,
    driverStatus: (row.driver_status as string | null) ?? null,
    shipmentCount: mappedShipments.length,
    cargoWeightKg,
    cargoVolumeM3: cargoVolumeM3 || null,
    shipments: mappedShipments,
    stops: stops.rows.map((item) => mapStop(item as Record<string, unknown>, shipmentRefs)),
    events: events.rows.map(mapEvent),
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function updateRoute(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  input: UpdateRouteInput,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot update routes');
  }
  if (
    isRouteStructurallyLocked(current.status) &&
    (input.vehicleId !== undefined || input.driverId !== undefined)
  ) {
    throw unprocessable('Vehicle and driver cannot be changed after dispatch');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.vehicleId) {
      await assertVehicleAssignable(
        client,
        current.organizationId,
        input.vehicleId,
        routeId,
        false,
      );
    }
    if (input.driverId) {
      await assertDriverAssignable(client, current.organizationId, input.driverId, routeId, false);
    }
    await client.query(
      `
        UPDATE routes
        SET route_type = COALESCE($2::route_type, route_type),
            vehicle_id = CASE WHEN $3::boolean THEN $4 ELSE vehicle_id END,
            driver_id = CASE WHEN $5::boolean THEN $6 ELSE driver_id END,
            planned_departure_at = CASE WHEN $7::boolean THEN $8 ELSE planned_departure_at END,
            planned_arrival_at = CASE WHEN $9::boolean THEN $10 ELSE planned_arrival_at END,
            distance_km = CASE WHEN $11::boolean THEN $12 ELSE distance_km END,
            estimated_duration_minutes = CASE WHEN $13::boolean THEN $14 ELSE estimated_duration_minutes END,
            notes = CASE WHEN $15::boolean THEN $16 ELSE notes END
        WHERE id = $1
      `,
      [
        routeId,
        input.routeType ?? null,
        input.vehicleId !== undefined,
        input.vehicleId ?? null,
        input.driverId !== undefined,
        input.driverId ?? null,
        input.plannedDepartureAt !== undefined,
        input.plannedDepartureAt ?? null,
        input.plannedArrivalAt !== undefined,
        input.plannedArrivalAt ?? null,
        input.distanceKm !== undefined,
        input.distanceKm ?? null,
        input.estimatedDurationMinutes !== undefined,
        input.estimatedDurationMinutes ?? null,
        input.notes !== undefined,
        input.notes ?? null,
      ],
    );
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'UPDATED',
      status: current.status,
      description: 'Route details updated',
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updated = await loadRoute(pool, actor, routeId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_UPDATED',
    entityType: 'route',
    entityId: routeId,
    before: { vehicleId: current.vehicleId, driverId: current.driverId },
    after: { vehicleId: updated.vehicleId, driverId: updated.driverId },
  });
  if (input.vehicleId && input.vehicleId !== current.vehicleId) {
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: current.organizationId,
      action: 'ROUTE_VEHICLE_ASSIGNED',
      entityType: 'route',
      entityId: routeId,
      after: { vehicleId: input.vehicleId },
    });
  }
  if (input.driverId && input.driverId !== current.driverId) {
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: current.organizationId,
      action: 'ROUTE_DRIVER_ASSIGNED',
      entityType: 'route',
      entityId: routeId,
      after: { driverId: input.driverId },
    });
  }
  return updated;
}

export async function updateRouteStatus(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  input: StatusInput,
) {
  if (input.status === 'DISPATCHED') {
    return dispatchRoute(pool, actor, routeId, input.note);
  }
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot change route status');
  }
  if (!canTransitionRoute(current.status, input.status)) {
    throw new AppError(
      422,
      'ROUTE_INVALID_TRANSITION',
      `Cannot move a ${current.status} route to ${input.status}.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE routes
        SET status = $2::route_status,
            actual_departure_at = CASE
              WHEN $2::text = 'IN_TRANSIT' THEN coalesce(actual_departure_at, now())
              ELSE actual_departure_at
            END,
            actual_arrival_at = CASE
              WHEN $2::text IN ('ARRIVED', 'COMPLETED') THEN coalesce(actual_arrival_at, now())
              ELSE actual_arrival_at
            END
        WHERE id = $1
      `,
      [routeId, input.status],
    );
    await persistPreviousFleetStatus(client, current, input.status);
    await applyFleetForRouteStatus(client, current, input.status);
    const action =
      input.status === 'CANCELLED'
        ? 'CANCELLED'
        : input.status === 'COMPLETED'
          ? 'COMPLETED'
          : 'STATUS_CHANGED';
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: action,
      previousStatus: current.status,
      status: input.status,
      description: input.note ?? `Status changed from ${current.status} to ${input.status}`,
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: input.status === 'CANCELLED' ? 'ROUTE_CANCELLED' : 'ROUTE_STATUS_CHANGED',
    entityType: 'route',
    entityId: routeId,
    before: { status: current.status },
    after: { status: input.status, note: input.note ?? null },
  });
  if (input.status === 'COMPLETED') {
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: current.organizationId,
      action: 'ROUTE_COMPLETED',
      entityType: 'route',
      entityId: routeId,
    });
  }
  return loadRoute(pool, actor, routeId);
}

export async function validateDispatch(pool: Pool, actor: AuthContext, routeId: string) {
  const route = await loadRoute(pool, actor, routeId);
  return buildDispatchValidation(pool, route);
}

export async function dispatchRoute(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  note?: string,
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot dispatch routes');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query<{ status: RouteStatus; organization_id: string }>(
      `SELECT status::text AS status, organization_id FROM routes WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [routeId],
    );
    if (!locked.rows[0]) {
      throw notFound('Route not found');
    }
    assertOperatorAccess(actor, locked.rows[0].organization_id);
    const current = await loadRoute(pool, actor, routeId);
    const validation = await buildDispatchValidation(pool, current, client);
    if (!validation.ok) {
      throw unprocessable(
        validation.errors[0] ?? 'Route is not ready for dispatch',
        validation.errors,
      );
    }
    if (!canTransitionRoute(current.status, 'DISPATCHED')) {
      throw new AppError(
        422,
        'ROUTE_INVALID_TRANSITION',
        `Cannot dispatch a ${current.status} route.`,
      );
    }

    await persistPreviousFleetStatus(client, current, 'DISPATCHED');
    await client.query(
      `
        UPDATE routes
        SET status = 'DISPATCHED',
            dispatched_at = now()
        WHERE id = $1
      `,
      [routeId],
    );
    await applyFleetForRouteStatus(client, current, 'DISPATCHED');
    await markShipmentsAssigned(client, current, actor.userId);
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'DISPATCHED',
      previousStatus: current.status,
      status: 'DISPATCHED',
      description: note ?? `Route ${current.reference} dispatched`,
      actorUserId: actor.userId,
      metadata: {
        vehicleId: current.vehicleId,
        driverId: current.driverId,
        cargoWeightKg: current.cargoWeightKg,
        vehicleCapacityKg: current.vehicleCapacityKg,
      },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const dispatched = await loadRoute(pool, actor, routeId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: dispatched.organizationId,
    action: 'ROUTE_DISPATCHED',
    entityType: 'route',
    entityId: routeId,
    before: { status: 'READY' },
    after: {
      status: 'DISPATCHED',
      vehicleId: dispatched.vehicleId,
      driverId: dispatched.driverId,
    },
  });
  return dispatched;
}

export async function archiveRoute(pool: Pool, actor: AuthContext, routeId: string) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot archive routes');
  }
  if (current.status !== 'DRAFT' && current.status !== 'CANCELLED') {
    throw unprocessable('Only draft or cancelled routes can be archived');
  }
  await pool.query('UPDATE routes SET deleted_at = now() WHERE id = $1', [routeId]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_ARCHIVED',
    entityType: 'route',
    entityId: routeId,
    before: { reference: current.reference, status: current.status },
  });
  return { id: routeId, archived: true };
}

export async function addRouteShipment(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  shipmentId: string,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot assign shipments');
  }
  if (isRouteStructurallyLocked(current.status)) {
    throw unprocessable('Shipments cannot be added after dispatch');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertShipmentAssignable(client, actor, current.organizationId, shipmentId);
    await client.query(
      `
        INSERT INTO route_shipments (route_id, shipment_id, organization_id)
        VALUES ($1, $2, $3)
      `,
      [routeId, shipmentId, current.organizationId],
    );
    const existingStops = current.stops.length;
    await seedStopsFromShipments(
      client,
      current.organizationId,
      routeId,
      [shipmentId],
      existingStops,
    );
    await refreshRouteEndpoints(client, routeId);
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'SHIPMENT_ADDED',
      status: current.status,
      description: `Shipment added to route`,
      actorUserId: actor.userId,
      metadata: { shipmentId },
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_SHIPMENT_ADDED',
    entityType: 'route',
    entityId: routeId,
    after: { shipmentId },
  });
  return loadRoute(pool, actor, routeId);
}

export async function removeRouteShipment(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  shipmentId: string,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot remove shipments');
  }
  if (isRouteStructurallyLocked(current.status)) {
    throw unprocessable('Shipments cannot be removed after dispatch');
  }
  const removed = await pool.query(
    'DELETE FROM route_shipments WHERE route_id = $1 AND shipment_id = $2',
    [routeId, shipmentId],
  );
  if ((removed.rowCount ?? 0) === 0) {
    throw notFound('Shipment is not on this route');
  }
  await pool.query(
    `
      INSERT INTO route_events (route_id, organization_id, event_type, status, description, actor_user_id, metadata)
      VALUES ($1, $2, 'SHIPMENT_REMOVED', $3, 'Shipment removed from route', $4, $5::jsonb)
    `,
    [routeId, current.organizationId, current.status, actor.userId, JSON.stringify({ shipmentId })],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_SHIPMENT_REMOVED',
    entityType: 'route',
    entityId: routeId,
    before: { shipmentId },
  });
  return loadRoute(pool, actor, routeId);
}

export async function addRouteStop(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  input: StopInput,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage stops');
  }
  if (isRouteStructurallyLocked(current.status)) {
    throw unprocessable('Stops cannot be added after dispatch');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stop = await insertStop(
      client,
      current.organizationId,
      routeId,
      current.stops.length + 1,
      input,
    );
    await refreshRouteEndpoints(client, routeId);
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'STOP_ADDED',
      status: current.status,
      description: `Stop ${stop.sequence} added`,
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_STOP_ADDED',
    entityType: 'route',
    entityId: routeId,
  });
  return loadRoute(pool, actor, routeId);
}

export async function updateRouteStop(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  stopId: string,
  input: Partial<StopInput>,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage stops');
  }
  const existing = current.stops.find((stop) => stop.id === stopId);
  if (!existing) {
    throw notFound('Stop not found');
  }
  if (
    isRouteStructurallyLocked(current.status) &&
    (input.stopType || input.formattedAddress || input.addressId)
  ) {
    throw unprocessable('Stop structure cannot be changed after dispatch');
  }
  await pool.query(
    `
      INSERT INTO route_events (route_id, organization_id, event_type, status, description, actor_user_id)
      VALUES ($1, $2, 'STOP_UPDATED', $3, 'Stop updated', $4)
    `,
    [routeId, current.organizationId, current.status, actor.userId],
  );
  await pool.query(
    `
      UPDATE route_stops
      SET stop_type = COALESCE($3::route_stop_type, stop_type),
          status = COALESCE($4::route_stop_status, status),
          contact_name = CASE WHEN $5::boolean THEN $6 ELSE contact_name END,
          contact_phone_e164 = CASE WHEN $7::boolean THEN $8 ELSE contact_phone_e164 END,
          planned_arrival_at = CASE WHEN $9::boolean THEN $10 ELSE planned_arrival_at END,
          planned_departure_at = CASE WHEN $11::boolean THEN $12 ELSE planned_departure_at END,
          actual_arrival_at = CASE WHEN $13::boolean THEN $14 ELSE actual_arrival_at END,
          actual_departure_at = CASE WHEN $15::boolean THEN $16 ELSE actual_departure_at END,
          instructions = CASE WHEN $17::boolean THEN $18 ELSE instructions END,
          notes = CASE WHEN $19::boolean THEN $20 ELSE notes END,
          formatted_address = COALESCE($21, formatted_address)
      WHERE id = $1 AND route_id = $2 AND deleted_at IS NULL
    `,
    [
      stopId,
      routeId,
      input.stopType ?? null,
      input.status ?? null,
      input.contactName !== undefined,
      input.contactName ?? null,
      input.contactPhone !== undefined,
      input.contactPhone ?? null,
      input.plannedArrivalAt !== undefined,
      input.plannedArrivalAt ?? null,
      input.plannedDepartureAt !== undefined,
      input.plannedDepartureAt ?? null,
      input.actualArrivalAt !== undefined,
      input.actualArrivalAt ?? null,
      input.actualDepartureAt !== undefined,
      input.actualDepartureAt ?? null,
      input.instructions !== undefined,
      input.instructions ?? null,
      input.notes !== undefined,
      input.notes ?? null,
      input.formattedAddress ?? null,
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_STOP_UPDATED',
    entityType: 'route_stop',
    entityId: stopId,
  });
  return loadRoute(pool, actor, routeId);
}

export async function removeRouteStop(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  stopId: string,
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage stops');
  }
  if (isRouteStructurallyLocked(current.status)) {
    throw unprocessable('Stops cannot be removed after dispatch');
  }
  const existing = current.stops.find((stop) => stop.id === stopId);
  if (!existing) {
    throw notFound('Stop not found');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE route_stops SET deleted_at = now() WHERE id = $1 AND route_id = $2',
      [stopId, routeId],
    );
    const remaining = current.stops.filter((stop) => stop.id !== stopId);
    let sequence = 1;
    for (const stop of remaining) {
      await client.query('UPDATE route_stops SET sequence = $2 WHERE id = $1', [stop.id, sequence]);
      sequence += 1;
    }
    await refreshRouteEndpoints(client, routeId);
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'STOP_REMOVED',
      status: current.status,
      description: `Stop ${existing.sequence} removed`,
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_STOP_REMOVED',
    entityType: 'route_stop',
    entityId: stopId,
  });
  return loadRoute(pool, actor, routeId);
}

export async function reorderRouteStops(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
  stopIds: string[],
) {
  const current = await loadRoute(pool, actor, routeId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage stops');
  }
  if (isRouteStructurallyLocked(current.status)) {
    throw unprocessable('Stops cannot be reordered after dispatch');
  }
  const currentIds = current.stops.map((stop) => stop.id);
  if (stopIds.length !== currentIds.length || stopIds.some((id) => !currentIds.includes(id))) {
    throw unprocessable('Reorder must include every stop on the route exactly once');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let offset = current.stops.length + 10;
    for (const stopId of stopIds) {
      await client.query('UPDATE route_stops SET sequence = $2 WHERE id = $1', [stopId, offset]);
      offset += 1;
    }
    let sequence = 1;
    for (const stopId of stopIds) {
      await client.query('UPDATE route_stops SET sequence = $2 WHERE id = $1', [stopId, sequence]);
      sequence += 1;
    }
    await refreshRouteEndpoints(client, routeId);
    await insertRouteEvent(client, {
      routeId,
      organizationId: current.organizationId,
      type: 'STOP_REORDERED',
      status: current.status,
      description: 'Stop sequence updated',
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'ROUTE_STOPS_REORDERED',
    entityType: 'route',
    entityId: routeId,
  });
  return loadRoute(pool, actor, routeId);
}

export async function getDispatchBoard(pool: Pool, actor: AuthContext) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot access the dispatch board');
  }
  const params: unknown[] = [];
  const orgWhere: string[] = [];
  applyOperatorFilter(actor, orgWhere, params, 'organization_id');
  const orgClause = orgWhere.length ? `AND ${orgWhere.join(' AND ')}` : '';

  const shipmentWhere = ['s.deleted_at IS NULL'];
  const shipmentParams: unknown[] = [];
  applyOperatorFilter(actor, shipmentWhere, shipmentParams, 's.operator_organization_id');
  shipmentWhere.push(`s.status::text IN ('CONFIRMED', 'ASSIGNED', 'READY_FOR_PICKUP')`);
  shipmentWhere.push(`
    NOT EXISTS (
      SELECT 1 FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = s.id
        AND r.deleted_at IS NULL
        AND r.status::text NOT IN ('CANCELLED', 'COMPLETED')
    )
  `);

  const [unassigned, planned, vehicles, drivers] = await Promise.all([
    pool.query(
      `
        SELECT s.id, s.reference, s.status::text AS status, c.name AS customer_name,
               s.weight_kg, s.estimated_pickup_at,
               oa.formatted_address AS origin, da.formatted_address AS destination
        FROM shipments s
        JOIN organizations c ON c.id = s.customer_organization_id
        LEFT JOIN addresses oa ON oa.id = s.origin_address_id
        LEFT JOIN addresses da ON da.id = s.destination_address_id
        WHERE ${shipmentWhere.join(' AND ')}
        ORDER BY s.estimated_pickup_at NULLS LAST, s.created_at
        LIMIT 50
      `,
      shipmentParams,
    ),
    listRoutes(pool, actor, {
      page: 1,
      pageSize: 25,
      sort: 'plannedDepartureAt',
      order: 'asc',
    }),
    pool.query(
      `
        SELECT v.id, v.reference, v.registration_number, t.name AS vehicle_type_name,
               v.payload_capacity, v.payload_unit::text AS payload_unit,
               v.status::text AS status, v.availability::text AS availability
        FROM vehicles v
        JOIN vehicle_types t ON t.code = v.vehicle_type_code
        WHERE v.deleted_at IS NULL
          AND v.status::text IN ('ACTIVE', 'AVAILABLE')
          ${orgClause.replace('organization_id', 'v.organization_id')}
          AND NOT EXISTS (
            SELECT 1 FROM routes r
            WHERE r.vehicle_id = v.id AND r.deleted_at IS NULL
              AND r.status::text IN ('READY', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED')
          )
        ORDER BY v.registration_number
      `,
      params,
    ),
    pool.query(
      `
        SELECT id, reference, first_name, last_name, phone_e164,
               status::text AS status, availability::text AS availability
        FROM drivers
        WHERE deleted_at IS NULL
          AND status::text IN ('ACTIVE', 'AVAILABLE')
          ${orgClause}
          AND NOT EXISTS (
            SELECT 1 FROM routes r
            WHERE r.driver_id = drivers.id AND r.deleted_at IS NULL
              AND r.status::text IN ('READY', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED')
          )
        ORDER BY last_name, first_name
      `,
      params,
    ),
  ]);

  return {
    unassignedShipments: unassigned.rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      status: String(row.status),
      customerName: String(row.customer_name),
      origin: (row.origin as string | null) ?? null,
      destination: (row.destination as string | null) ?? null,
      weightKg: toNumber(row.weight_kg as string | null),
      estimatedPickupAt: toIso(row.estimated_pickup_at as Date | null),
    })),
    plannedRoutes: planned.routes.filter((route) =>
      ['DRAFT', 'PLANNED', 'READY'].includes(route.status),
    ),
    availableVehicles: vehicles.rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      registrationNumber: String(row.registration_number),
      vehicleTypeName: String(row.vehicle_type_name),
      payloadCapacity: toNumber(row.payload_capacity as string | null),
      payloadUnit: String(row.payload_unit ?? 'KG'),
      status: String(row.status),
      availability: String(row.availability),
    })),
    availableDrivers: drivers.rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      phoneE164: String(row.phone_e164),
      status: String(row.status),
      availability: String(row.availability),
    })),
  };
}

async function buildDispatchValidation(
  pool: Pool | PoolClient,
  route: RoutePayload,
  client: Pool | PoolClient = pool,
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (route.status !== 'READY') {
    errors.push('Route must be in Ready status before dispatch.');
  }
  if (route.shipments.length === 0) {
    errors.push('Route must include at least one shipment.');
  }
  if (route.stops.length === 0) {
    errors.push('Route must include at least one stop.');
  }
  const hasPickup = route.stops.some((stop) => stop.stopType === 'PICKUP');
  const hasDelivery = route.stops.some((stop) => stop.stopType === 'DELIVERY');
  if (!hasPickup || !hasDelivery) {
    errors.push('Route must include at least one pickup and one delivery stop.');
  }
  if (!route.vehicleId) {
    errors.push('A vehicle must be assigned before dispatch.');
  }
  if (!route.driverId) {
    errors.push('A driver must be assigned before dispatch.');
  }
  if (route.vehicleId) {
    try {
      await assertVehicleAssignable(client, route.organizationId, route.vehicleId, route.id, true);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Vehicle is not available.');
    }
  }
  if (route.driverId) {
    try {
      await assertDriverAssignable(client, route.organizationId, route.driverId, route.id, true);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Driver is not available.');
    }
  }
  if (route.vehicleCapacityKg != null && route.cargoWeightKg > route.vehicleCapacityKg) {
    errors.push(
      `Total cargo weight ${route.cargoWeightKg} kg exceeds vehicle capacity ${route.vehicleCapacityKg} kg.`,
    );
  }
  if (route.vehicleCapacityKg == null && route.cargoWeightKg > 0) {
    warnings.push('Selected vehicle has no recorded payload capacity.');
  }
  if (!route.plannedDepartureAt) {
    warnings.push('Planned departure is not set.');
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    cargoWeightKg: route.cargoWeightKg,
    vehicleCapacityKg: route.vehicleCapacityKg,
    cargoVolumeM3: route.cargoVolumeM3,
  };
}

async function persistPreviousFleetStatus(
  client: PoolClient,
  route: RoutePayload,
  nextStatus: RouteStatus,
) {
  if (nextStatus !== 'READY' && nextStatus !== 'DISPATCHED') {
    return;
  }
  await client.query(
    `
      UPDATE routes
      SET previous_vehicle_status = COALESCE(previous_vehicle_status, $2),
          previous_driver_status = COALESCE(previous_driver_status, $3)
      WHERE id = $1
    `,
    [route.id, route.vehicleStatus, route.driverStatus],
  );
}

async function applyFleetForRouteStatus(
  client: PoolClient,
  route: RoutePayload,
  nextStatus: RouteStatus,
) {
  if (!route.vehicleId && !route.driverId) {
    return;
  }
  if (nextStatus === 'DRAFT' || nextStatus === 'PLANNED') {
    if (route.status === 'READY') {
      await restoreFleet(client, route);
    }
    return;
  }
  if (nextStatus === 'DISPATCHED' || nextStatus === 'READY') {
    if (route.vehicleId) {
      await setVehicleState(client, route.vehicleId, 'ASSIGNED');
    }
    if (route.driverId) {
      await setDriverState(client, route.driverId, 'ASSIGNED');
    }
  }
  if (nextStatus === 'IN_TRANSIT') {
    if (route.vehicleId) {
      await setVehicleState(client, route.vehicleId, 'IN_TRANSIT');
    }
    if (route.driverId) {
      await setDriverState(client, route.driverId, 'ON_TRIP');
    }
  }
  if (nextStatus === 'ARRIVED') {
    if (route.vehicleId) {
      await setVehicleState(client, route.vehicleId, 'ASSIGNED');
    }
    if (route.driverId) {
      await setDriverState(client, route.driverId, 'ASSIGNED');
    }
  }
  if (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') {
    await restoreFleet(client, route);
  }
}

async function restoreFleet(client: PoolClient, route: RoutePayload) {
  if (route.vehicleId) {
    const restore = (await previousFleetStatus(client, route.id, 'vehicle')) ?? 'AVAILABLE';
    await setVehicleState(
      client,
      route.vehicleId,
      restore === 'IN_TRANSIT' || restore === 'ASSIGNED' ? 'AVAILABLE' : (restore as VehicleStatus),
    );
  }
  if (route.driverId) {
    const restore = (await previousFleetStatus(client, route.id, 'driver')) ?? 'AVAILABLE';
    await setDriverState(
      client,
      route.driverId,
      restore === 'ON_TRIP' || restore === 'ASSIGNED' ? 'AVAILABLE' : (restore as DriverStatus),
    );
  }
}

async function previousFleetStatus(
  client: PoolClient,
  routeId: string,
  kind: 'vehicle' | 'driver',
) {
  const column = kind === 'vehicle' ? 'previous_vehicle_status' : 'previous_driver_status';
  const result = await client.query<{ value: string | null }>(
    `SELECT ${column} AS value FROM routes WHERE id = $1`,
    [routeId],
  );
  return result.rows[0]?.value ?? null;
}

async function setVehicleState(client: PoolClient, vehicleId: string, status: VehicleStatus) {
  await client.query(
    `
      UPDATE vehicles
      SET status = $2::vehicle_status,
          availability = $3::vehicle_availability
      WHERE id = $1
    `,
    [vehicleId, status, availabilityForVehicleStatus(status)],
  );
}

async function setDriverState(client: PoolClient, driverId: string, status: DriverStatus) {
  await client.query(
    `
      UPDATE drivers
      SET status = $2::driver_status,
          availability = $3::driver_availability
      WHERE id = $1
    `,
    [driverId, status, availabilityForDriverStatus(status)],
  );
}

async function markShipmentsAssigned(client: PoolClient, route: RoutePayload, actorUserId: string) {
  for (const shipment of route.shipments) {
    const current = shipment.status as ShipmentStatus;
    if (current === 'CONFIRMED' && canTransitionShipment(current, 'ASSIGNED')) {
      await client.query(`UPDATE shipments SET status = 'ASSIGNED' WHERE id = $1`, [
        shipment.shipmentId,
      ]);
      await client.query(
        `
          INSERT INTO shipment_events (shipment_id, event_type, previous_status, status, note, actor_user_id)
          VALUES ($1, 'STATUS_CHANGED', $2, 'ASSIGNED', $3, $4)
        `,
        [shipment.shipmentId, current, `Assigned to route ${route.reference}`, actorUserId],
      );
    }
  }
}

async function assertVehicleAssignable(
  client: Pool | PoolClient,
  organizationId: string,
  vehicleId: string,
  excludeRouteId: string | undefined,
  forDispatch: boolean,
) {
  const result = await client.query<{
    organization_id: string;
    status: VehicleStatus;
    deleted_at: Date | null;
  }>(`SELECT organization_id, status::text AS status, deleted_at FROM vehicles WHERE id = $1`, [
    vehicleId,
  ]);
  const row = result.rows[0];
  if (!row || row.deleted_at) {
    throw notFound('Vehicle not found');
  }
  if (row.organization_id !== organizationId) {
    throw forbidden('Vehicle belongs to another organization');
  }
  if (['INACTIVE', 'RETIRED', 'MAINTENANCE'].includes(row.status)) {
    throw unprocessable(`Vehicle is ${row.status.toLowerCase()} and cannot be assigned`);
  }
  if (forDispatch && !ASSIGNABLE_VEHICLE_STATUSES.has(row.status) && row.status !== 'ASSIGNED') {
    throw unprocessable(`Vehicle status ${row.status} is not available for dispatch`);
  }
  const conflict = await client.query<{ reference: string }>(
    `
      SELECT reference FROM routes
      WHERE vehicle_id = $1 AND deleted_at IS NULL
        AND status::text IN ('READY', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED')
        AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 1
    `,
    [vehicleId, excludeRouteId ?? null],
  );
  if (conflict.rows[0]) {
    throw unprocessable(`Vehicle is already committed to route ${conflict.rows[0].reference}`);
  }
}

async function assertDriverAssignable(
  client: Pool | PoolClient,
  organizationId: string,
  driverId: string,
  excludeRouteId: string | undefined,
  forDispatch: boolean,
) {
  const result = await client.query<{
    organization_id: string;
    status: DriverStatus;
    deleted_at: Date | null;
  }>(`SELECT organization_id, status::text AS status, deleted_at FROM drivers WHERE id = $1`, [
    driverId,
  ]);
  const row = result.rows[0];
  if (!row || row.deleted_at) {
    throw notFound('Driver not found');
  }
  if (row.organization_id !== organizationId) {
    throw forbidden('Driver belongs to another organization');
  }
  if (['INACTIVE', 'SUSPENDED', 'OFF_DUTY'].includes(row.status)) {
    throw unprocessable(
      `Driver is ${row.status.replaceAll('_', ' ').toLowerCase()} and cannot be assigned`,
    );
  }
  if (forDispatch && !ASSIGNABLE_DRIVER_STATUSES.has(row.status) && row.status !== 'ASSIGNED') {
    throw unprocessable(`Driver status ${row.status} is not available for dispatch`);
  }
  const conflict = await client.query<{ reference: string }>(
    `
      SELECT reference FROM routes
      WHERE driver_id = $1 AND deleted_at IS NULL
        AND status::text IN ('READY', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED')
        AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 1
    `,
    [driverId, excludeRouteId ?? null],
  );
  if (conflict.rows[0]) {
    throw unprocessable(`Driver is already committed to route ${conflict.rows[0].reference}`);
  }
}

async function assertShipmentAssignable(
  client: PoolClient,
  actor: AuthContext,
  organizationId: string,
  shipmentId: string,
) {
  const result = await client.query<{
    operator_organization_id: string;
    customer_organization_id: string;
    status: string;
    deleted_at: Date | null;
  }>(
    `
      SELECT operator_organization_id, customer_organization_id, status::text AS status, deleted_at
      FROM shipments WHERE id = $1
    `,
    [shipmentId],
  );
  const row = result.rows[0];
  if (!row || row.deleted_at) {
    throw notFound('Shipment not found');
  }
  if (row.operator_organization_id !== organizationId) {
    throw forbidden('Shipment belongs to another organization');
  }
  if (['CANCELLED', 'DELIVERED'].includes(row.status)) {
    throw unprocessable('Delivered or cancelled shipments cannot be added to a route');
  }
  const conflict = await client.query<{ reference: string }>(
    `
      SELECT r.reference
      FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = $1 AND r.deleted_at IS NULL
        AND r.status::text NOT IN ('CANCELLED', 'COMPLETED')
      LIMIT 1
    `,
    [shipmentId],
  );
  if (conflict.rows[0]) {
    throw unprocessable(`Shipment is already on active route ${conflict.rows[0].reference}`);
  }
  if (actor.orgType === 'CUSTOMER' && actor.orgId !== row.customer_organization_id) {
    throw forbidden('You do not have access to this shipment');
  }
}

async function seedStopsFromShipments(
  client: PoolClient,
  organizationId: string,
  routeId: string,
  shipmentIds: string[],
  startSequence = 0,
) {
  let sequence = startSequence;
  for (const shipmentId of shipmentIds) {
    const shipment = await client.query(
      `
        SELECT s.id,
               s.pickup_contact_name, s.pickup_phone_e164, s.pickup_instructions,
               s.delivery_contact_name, s.delivery_phone_e164, s.delivery_instructions,
               s.origin_address_id, s.destination_address_id,
               oa.formatted_address AS origin_address, oa.latitude AS origin_lat, oa.longitude AS origin_lng,
               da.formatted_address AS destination_address, da.latitude AS dest_lat, da.longitude AS dest_lng
        FROM shipments s
        LEFT JOIN addresses oa ON oa.id = s.origin_address_id
        LEFT JOIN addresses da ON da.id = s.destination_address_id
        WHERE s.id = $1
      `,
      [shipmentId],
    );
    const row = shipment.rows[0] as Record<string, unknown> | undefined;
    if (!row) continue;
    sequence += 1;
    await insertStop(client, organizationId, routeId, sequence, {
      shipmentId,
      stopType: 'PICKUP',
      addressId: (row.origin_address_id as string | null) ?? undefined,
      formattedAddress: (row.origin_address as string | null) ?? 'Pickup',
      contactName: (row.pickup_contact_name as string | null) ?? undefined,
      contactPhone: (row.pickup_phone_e164 as string | null) ?? undefined,
      instructions: (row.pickup_instructions as string | null) ?? undefined,
      latitude: toNumber(row.origin_lat as string | null) ?? undefined,
      longitude: toNumber(row.origin_lng as string | null) ?? undefined,
    });
    sequence += 1;
    await insertStop(client, organizationId, routeId, sequence, {
      shipmentId,
      stopType: 'DELIVERY',
      addressId: (row.destination_address_id as string | null) ?? undefined,
      formattedAddress: (row.destination_address as string | null) ?? 'Delivery',
      contactName: (row.delivery_contact_name as string | null) ?? undefined,
      contactPhone: (row.delivery_phone_e164 as string | null) ?? undefined,
      instructions: (row.delivery_instructions as string | null) ?? undefined,
      latitude: toNumber(row.dest_lat as string | null) ?? undefined,
      longitude: toNumber(row.dest_lng as string | null) ?? undefined,
    });
  }
}

async function insertStop(
  client: PoolClient,
  organizationId: string,
  routeId: string,
  sequence: number,
  input: StopInput,
) {
  let addressId = input.addressId ?? null;
  let formatted = input.formattedAddress ?? '';
  if (!addressId && input.streetLine1 && input.countryCode) {
    addressId = await insertAddress(client, organizationId, {
      countryCode: input.countryCode,
      streetLine1: input.streetLine1,
      adminArea1: input.adminArea1,
      adminArea2: input.adminArea2,
      locality: input.locality,
      latitude: input.latitude,
      longitude: input.longitude,
      addressType: input.stopType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
    });
  }
  if (!formatted && addressId) {
    const address = await client.query<{ formatted_address: string }>(
      'SELECT formatted_address FROM addresses WHERE id = $1',
      [addressId],
    );
    formatted = address.rows[0]?.formatted_address ?? `Stop ${sequence}`;
  }
  if (!formatted) {
    formatted = `${input.stopType} stop ${sequence}`;
  }
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO route_stops (
        route_id, organization_id, shipment_id, sequence, stop_type, status,
        address_id, formatted_address, contact_name, contact_phone_e164,
        planned_arrival_at, planned_departure_at, instructions, latitude, longitude, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `,
    [
      routeId,
      organizationId,
      input.shipmentId ?? null,
      sequence,
      input.stopType,
      input.status ?? 'PENDING',
      addressId,
      formatted,
      input.contactName ?? null,
      input.contactPhone ?? null,
      input.plannedArrivalAt ?? null,
      input.plannedDepartureAt ?? null,
      input.instructions ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.notes ?? null,
    ],
  );
  return { id: created.rows[0]?.id, sequence };
}

async function refreshRouteEndpoints(client: PoolClient, routeId: string) {
  const stops = await client.query<{ formatted_address: string }>(
    `
      SELECT formatted_address
      FROM route_stops
      WHERE route_id = $1 AND deleted_at IS NULL
      ORDER BY sequence
    `,
    [routeId],
  );
  const origin = stops.rows[0]?.formatted_address ?? null;
  const destination = stops.rows[stops.rows.length - 1]?.formatted_address ?? null;
  await client.query('UPDATE routes SET origin_text = $2, destination_text = $3 WHERE id = $1', [
    routeId,
    origin,
    destination,
  ]);
}

async function insertRouteEvent(
  client: PoolClient,
  entry: {
    routeId: string;
    organizationId: string;
    type: string;
    previousStatus?: RouteStatus;
    status?: RouteStatus;
    description?: string;
    actorUserId?: string;
    location?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      INSERT INTO route_events (
        route_id, organization_id, event_type, previous_status, status,
        description, actor_user_id, location_label, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      entry.routeId,
      entry.organizationId,
      entry.type,
      entry.previousStatus ?? null,
      entry.status ?? null,
      entry.description ?? null,
      entry.actorUserId ?? null,
      entry.location ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

async function nextRouteReference(client: PoolClient) {
  const result = await client.query<{ last_value: number }>(
    `
      UPDATE route_reference_counters
      SET last_value = last_value + 1
      WHERE id = 1
      RETURNING last_value
    `,
  );
  return `MX-RT-${String(result.rows[0]?.last_value ?? 1).padStart(6, '0')}`;
}

async function resolveRouteOrganization(pool: Pool, actor: AuthContext, requested?: string) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot create routes');
  }
  if (actor.orgType === 'OPERATOR') {
    return actor.orgId;
  }
  if (!requested) {
    throw forbidden('organizationId is required');
  }
  const found = await pool.query<{ id: string; type: string }>(
    `SELECT id, type::text AS type FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [requested],
  );
  if (!found.rows[0] || found.rows[0].type !== 'OPERATOR') {
    throw notFound('Transporter organization not found');
  }
  return found.rows[0].id;
}

function applyRouteVisibility(
  actor: AuthContext,
  where: string[],
  params: unknown[],
  orgColumn: string,
  routeIdColumn: string,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`${orgColumn} = $${params.length}`);
    return;
  }
  params.push(actor.orgId);
  where.push(`
    EXISTS (
      SELECT 1 FROM route_shipments rs
      JOIN shipments s ON s.id = rs.shipment_id
      WHERE rs.route_id = ${routeIdColumn}
        AND s.customer_organization_id = $${params.length}
    )
  `);
}

async function assertRouteAccess(
  pool: Pool,
  actor: AuthContext,
  organizationId: string,
  routeId: string,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    assertOperatorAccess(actor, organizationId);
    return;
  }
  const owned = await pool.query<{ id: string }>(
    `
      SELECT rs.id
      FROM route_shipments rs
      JOIN shipments s ON s.id = rs.shipment_id
      WHERE rs.route_id = $1 AND s.customer_organization_id = $2
      LIMIT 1
    `,
    [routeId, actor.orgId],
  );
  if (!owned.rows[0]) {
    throw forbidden('You do not have access to this route');
  }
}

function mapStop(row: Record<string, unknown>, refs: Map<string, string>): RouteStopPayload {
  const shipmentId = (row.shipment_id as string | null) ?? null;
  return {
    id: String(row.id),
    routeId: String(row.route_id),
    sequence: Number(row.sequence),
    stopType: row.stop_type as RouteStopType,
    status: row.status as RouteStopPayload['status'],
    shipmentId,
    shipmentReference: shipmentId ? (refs.get(shipmentId) ?? null) : null,
    addressId: (row.address_id as string | null) ?? null,
    formattedAddress: String(row.formatted_address),
    contactName: (row.contact_name as string | null) ?? null,
    contactPhone: (row.contact_phone_e164 as string | null) ?? null,
    plannedArrivalAt: toIso(row.planned_arrival_at as Date | null),
    actualArrivalAt: toIso(row.actual_arrival_at as Date | null),
    plannedDepartureAt: toIso(row.planned_departure_at as Date | null),
    actualDepartureAt: toIso(row.actual_departure_at as Date | null),
    instructions: (row.instructions as string | null) ?? null,
    latitude: toNumber(row.latitude as string | null),
    longitude: toNumber(row.longitude as string | null),
    notes: (row.notes as string | null) ?? null,
  };
}

function mapEvent(row: Record<string, unknown>): RouteEventPayload {
  return {
    id: String(row.id),
    type: String(row.event_type),
    previousStatus: (row.previous_status as RouteStatus | null) ?? null,
    status: (row.status as RouteStatus | null) ?? null,
    description: (row.description as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? null,
    location: (row.location_label as string | null) ?? null,
    latitude: toNumber(row.latitude as string | null),
    longitude: toNumber(row.longitude as string | null),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    occurredAt: (row.occurred_at as Date).toISOString(),
  };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
