import {
  canTransitionShipment,
  isCargoLocked,
  type ShipmentEventPayload,
  type ShipmentItemPayload,
  type ShipmentPayload,
  type ShipmentStatus,
} from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { insertAddress, mapAddress, toNumber, type AddressInput } from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  insertTrackingEvent,
  trackingEventTypeForShipmentStatus,
} from '../tracking/tracking.service.js';
import { notifyShipmentEvent } from '../notifications/notification.hooks.js';
import type { z } from 'zod';
import type {
  createShipmentSchema,
  listShipmentsQuerySchema,
  shipmentItemSchema,
  shipmentStopSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
} from './shipment.schemas.js';

type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;
type StatusInput = z.infer<typeof updateShipmentStatusSchema>;
type ItemInput = z.infer<typeof shipmentItemSchema>;
type StopInput = z.infer<typeof shipmentStopSchema>;
type AddressRef = { addressId: string } | AddressInput;

const SORT_COLUMNS = {
  createdAt: 's.created_at',
  reference: 's.reference',
  status: 's.status',
  priority: 's.priority',
  estimatedDeliveryAt: 's.estimated_delivery_at',
  customerName: 'c.name',
} as const;

export async function createShipment(pool: Pool, actor: AuthContext, input: CreateShipmentInput) {
  const customerId = await resolveCustomerId(pool, actor, input.customerOrganizationId);
  const operatorId = await resolveOperatorForCustomer(pool, actor, customerId);
  const pickupStop = normalizeStop(input.pickup, input.origin, 'PICKUP');
  const deliveryStop = normalizeStop(input.delivery, input.destination, 'DELIVERY');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const originId = await resolveAddress(client, customerId, pickupStop.address, 'PICKUP');
    const destinationId = await resolveAddress(
      client,
      customerId,
      deliveryStop.address,
      'DELIVERY',
    );
    const [originCountry, destinationCountry] = await Promise.all([
      countryOf(client, originId),
      countryOf(client, destinationId),
    ]);
    const reference = await nextReference(client, originCountry);
    const initialStatus = (input.status ?? 'CONFIRMED') as ShipmentStatus;
    const totals = summarizeItems(input.items ?? [], input.weightUnit, input.dimensionUnit);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO shipments (
          reference, customer_organization_id, operator_organization_id, booked_by_user_id,
          status, shipment_type, priority, description, cargo_description, cargo_type,
          weight_kg, weight_unit, pieces_count, volume_m3, dimension_unit,
          declared_value, declared_currency_code, special_instructions,
          origin_address_id, destination_address_id, origin_country_code, destination_country_code,
          estimated_pickup_at, estimated_delivery_at,
          pickup_contact_name, pickup_phone_e164, pickup_instructions,
          delivery_contact_name, delivery_phone_e164, delivery_instructions
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
        )
        RETURNING id
      `,
      [
        reference,
        customerId,
        operatorId,
        actor.userId,
        initialStatus,
        input.shipmentType,
        input.priority,
        input.description ?? null,
        input.cargoDescription,
        input.cargoType ?? null,
        input.weightKg ?? totals.weightKg,
        input.weightUnit,
        input.piecesCount ?? totals.piecesCount,
        totals.volumeM3,
        input.dimensionUnit,
        input.declaredValue ?? null,
        input.declaredCurrencyCode ?? null,
        input.specialInstructions ?? null,
        originId,
        destinationId,
        originCountry,
        destinationCountry,
        input.estimatedPickupAt ?? null,
        input.estimatedDeliveryAt ?? null,
        pickupStop.contactName ?? null,
        pickupStop.phoneE164 ?? null,
        pickupStop.instructions ?? null,
        deliveryStop.contactName ?? null,
        deliveryStop.phoneE164 ?? null,
        deliveryStop.instructions ?? null,
      ],
    );
    const shipmentId = created.rows[0]?.id;
    if (!shipmentId) {
      throw new Error('Failed to create shipment');
    }

    for (const item of input.items ?? []) {
      await insertItem(client, shipmentId, item, input.weightUnit, input.dimensionUnit);
    }

    await insertEvent(client, {
      shipmentId,
      type: 'CREATED',
      previousStatus: null,
      status: initialStatus,
      note: `Shipment ${initialStatus === 'DRAFT' ? 'saved as draft' : 'created'}`,
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');

    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: operatorId,
      action: 'SHIPMENT_CREATED',
      entityType: 'shipment',
      entityId: shipmentId,
      after: { reference, status: initialStatus, customerId },
    });
    const createdShipment = await loadShipment(pool, actor, shipmentId);
    await notifyShipmentEvent(pool, createdShipment, actor.userId);
    return createdShipment;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listShipments(pool: Pool, actor: AuthContext, query: ListShipmentsQuery) {
  const params: unknown[] = [];
  const where = ['s.deleted_at IS NULL'];
  applyTenantFilter(actor, where, params, 's');

  if (query.status) {
    params.push(query.status);
    where.push(`s.status::text = $${params.length}`);
  }
  if (query.customerId) {
    params.push(query.customerId);
    where.push(`s.customer_organization_id = $${params.length}`);
  }
  if (query.priority) {
    params.push(query.priority);
    where.push(`s.priority::text = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`s.created_at >= $${params.length}::timestamptz`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`s.created_at <= $${params.length}::timestamptz`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(s.reference) LIKE $${params.length} OR lower(c.name) LIKE $${params.length} OR lower(coalesce(s.cargo_description, '')) LIKE $${params.length} OR lower(coalesce(s.description, '')) LIKE $${params.length})`,
    );
  }

  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );

  const sortColumn = SORT_COLUMNS[query.sort];
  const sortDirection = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT s.id
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const shipments = await Promise.all(result.rows.map((row) => loadShipment(pool, actor, row.id)));
  return {
    shipments,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadShipment(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
): Promise<ShipmentPayload> {
  const result = await pool.query(
    `
      SELECT
        s.id, s.reference, s.status::text AS status, s.shipment_type::text AS shipment_type,
        s.priority::text AS priority, s.description,
        s.customer_organization_id, c.name AS customer_name,
        s.operator_organization_id, op.name AS operator_name,
        s.cargo_description, s.cargo_type, s.weight_kg, s.weight_unit::text AS weight_unit,
        s.pieces_count, s.volume_m3, s.dimension_unit::text AS dimension_unit,
        s.declared_value, s.declared_currency_code, s.special_instructions,
        s.origin_country_code, s.destination_country_code,
        s.estimated_pickup_at, s.estimated_delivery_at, s.actual_pickup_at, s.actual_delivery_at,
        s.pickup_contact_name, s.pickup_phone_e164, s.pickup_instructions,
        s.delivery_contact_name, s.delivery_phone_e164, s.delivery_instructions,
        s.booked_by_user_id, s.created_at, s.updated_at,
        s.origin_address_id, s.destination_address_id,
        NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS created_by_name
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      JOIN organizations op ON op.id = s.operator_organization_id
      LEFT JOIN users creator ON creator.id = s.booked_by_user_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `,
    [shipmentId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('Shipment not found');
  }
  assertShipmentAccess(
    actor,
    String(row.customer_organization_id),
    String(row.operator_organization_id),
  );

  const [origin, destination, items, events, currentRoute] = await Promise.all([
    loadAddress(pool, (row.origin_address_id as string | null) ?? null),
    loadAddress(pool, (row.destination_address_id as string | null) ?? null),
    pool.query(
      `
        SELECT id, description, quantity, weight_kg, weight_unit::text AS weight_unit,
               length_cm, width_cm, height_cm, dimension_unit::text AS dimension_unit,
               volume_m3, package_type::text AS package_type, is_fragile, special_handling
        FROM shipment_items WHERE shipment_id = $1 ORDER BY created_at
      `,
      [shipmentId],
    ),
    pool.query(
      `
        SELECT e.id, e.event_type, e.previous_status::text AS previous_status,
               e.status::text AS status, e.note, e.actor_user_id, e.location_label,
               e.latitude, e.longitude, e.metadata, e.occurred_at,
               NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
        FROM shipment_events e
        LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.shipment_id = $1
        ORDER BY e.occurred_at ASC
      `,
      [shipmentId],
    ),
    pool.query<{ id: string; reference: string; status: string }>(
      `
        SELECT r.id, r.reference, r.status::text AS status
        FROM route_shipments rs
        JOIN routes r ON r.id = rs.route_id
        WHERE rs.shipment_id = $1
          AND r.deleted_at IS NULL
          AND r.status::text NOT IN ('COMPLETED', 'CANCELLED')
        ORDER BY r.updated_at DESC
        LIMIT 1
      `,
      [shipmentId],
    ),
  ]);

  return {
    id: String(row.id),
    reference: String(row.reference),
    status: row.status as ShipmentStatus,
    shipmentType: String(row.shipment_type ?? 'STANDARD'),
    priority: String(row.priority ?? 'NORMAL'),
    description: (row.description as string | null) ?? null,
    customerOrganizationId: String(row.customer_organization_id),
    customerName: String(row.customer_name),
    operatorOrganizationId: String(row.operator_organization_id),
    operatorName: String(row.operator_name),
    cargoDescription: (row.cargo_description as string | null) ?? null,
    cargoType: (row.cargo_type as string | null) ?? null,
    weightKg: toNumber(row.weight_kg as string | null),
    weightUnit: String(row.weight_unit ?? 'KG'),
    piecesCount: (row.pieces_count as number | null) ?? null,
    volumeM3: toNumber(row.volume_m3 as string | null),
    dimensionUnit: String(row.dimension_unit ?? 'CM'),
    declaredValue: toNumber(row.declared_value as string | null),
    declaredCurrencyCode: (row.declared_currency_code as string | null) ?? null,
    specialInstructions: (row.special_instructions as string | null) ?? null,
    originCountryCode: String(row.origin_country_code),
    destinationCountryCode: String(row.destination_country_code),
    estimatedPickupAt: toIso(row.estimated_pickup_at as Date | null),
    estimatedDeliveryAt: toIso(row.estimated_delivery_at as Date | null),
    actualPickupAt: toIso(row.actual_pickup_at as Date | null),
    actualDeliveryAt: toIso(row.actual_delivery_at as Date | null),
    pickup: {
      contactName: (row.pickup_contact_name as string | null) ?? null,
      phoneE164: (row.pickup_phone_e164 as string | null) ?? null,
      instructions: (row.pickup_instructions as string | null) ?? null,
      address: origin,
    },
    delivery: {
      contactName: (row.delivery_contact_name as string | null) ?? null,
      phoneE164: (row.delivery_phone_e164 as string | null) ?? null,
      instructions: (row.delivery_instructions as string | null) ?? null,
      address: destination,
    },
    origin,
    destination,
    items: items.rows.map(mapItem),
    events: events.rows.map(mapEvent),
    createdByUserId: (row.booked_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    currentRoute: currentRoute.rows[0]
      ? {
          id: currentRoute.rows[0].id,
          reference: currentRoute.rows[0].reference,
          status: currentRoute.rows[0].status,
        }
      : null,
  };
}

export async function updateShipment(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
  input: UpdateShipmentInput,
) {
  const current = await loadShipment(pool, actor, shipmentId);
  if (current.status === 'CANCELLED' || current.status === 'DELIVERED') {
    throw unprocessable('Delivered or cancelled shipments cannot be edited');
  }

  const changingStops = Boolean(
    input.pickup || input.delivery || input.origin || input.destination,
  );
  if (changingStops && isCargoLocked(current.status)) {
    throw unprocessable('Pickup and delivery cannot be changed after pickup');
  }
  if (input.items && isCargoLocked(current.status)) {
    throw unprocessable('Packages cannot be changed after pickup');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let originId: string | undefined;
    let destinationId: string | undefined;
    let originCountry = current.originCountryCode;
    let destinationCountry = current.destinationCountryCode;

    if (input.pickup || input.origin) {
      const stop = normalizeStop(input.pickup, input.origin, 'PICKUP');
      originId = await resolveAddress(
        client,
        current.customerOrganizationId,
        stop.address,
        'PICKUP',
      );
      originCountry = await countryOf(client, originId);
      await client.query(
        `
          UPDATE shipments
          SET pickup_contact_name = COALESCE($2, pickup_contact_name),
              pickup_phone_e164 = COALESCE($3, pickup_phone_e164),
              pickup_instructions = COALESCE($4, pickup_instructions),
              origin_address_id = $5,
              origin_country_code = $6
          WHERE id = $1
        `,
        [
          shipmentId,
          stop.contactName ?? null,
          stop.phoneE164 ?? null,
          stop.instructions ?? null,
          originId,
          originCountry,
        ],
      );
    }

    if (input.delivery || input.destination) {
      const stop = normalizeStop(input.delivery, input.destination, 'DELIVERY');
      destinationId = await resolveAddress(
        client,
        current.customerOrganizationId,
        stop.address,
        'DELIVERY',
      );
      destinationCountry = await countryOf(client, destinationId);
      await client.query(
        `
          UPDATE shipments
          SET delivery_contact_name = COALESCE($2, delivery_contact_name),
              delivery_phone_e164 = COALESCE($3, delivery_phone_e164),
              delivery_instructions = COALESCE($4, delivery_instructions),
              destination_address_id = $5,
              destination_country_code = $6
          WHERE id = $1
        `,
        [
          shipmentId,
          stop.contactName ?? null,
          stop.phoneE164 ?? null,
          stop.instructions ?? null,
          destinationId,
          destinationCountry,
        ],
      );
    }

    await client.query(
      `
        UPDATE shipments
        SET shipment_type = COALESCE($2::shipment_type, shipment_type),
            priority = COALESCE($3::shipment_priority, priority),
            description = CASE WHEN $4::boolean THEN $5 ELSE description END,
            cargo_description = COALESCE($6, cargo_description),
            cargo_type = CASE WHEN $7::boolean THEN $8 ELSE cargo_type END,
            weight_unit = COALESCE($9::weight_unit, weight_unit),
            dimension_unit = COALESCE($10::dimension_unit, dimension_unit),
            declared_value = CASE WHEN $11::boolean THEN $12 ELSE declared_value END,
            declared_currency_code = CASE WHEN $13::boolean THEN $14 ELSE declared_currency_code END,
            special_instructions = CASE WHEN $15::boolean THEN $16 ELSE special_instructions END,
            estimated_pickup_at = CASE WHEN $17::boolean THEN $18 ELSE estimated_pickup_at END,
            estimated_delivery_at = CASE WHEN $19::boolean THEN $20 ELSE estimated_delivery_at END,
            updated_at = now()
        WHERE id = $1
      `,
      [
        shipmentId,
        input.shipmentType ?? null,
        input.priority ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.cargoDescription ?? null,
        input.cargoType !== undefined,
        input.cargoType ?? null,
        input.weightUnit ?? null,
        input.dimensionUnit ?? null,
        input.declaredValue !== undefined,
        input.declaredValue ?? null,
        input.declaredCurrencyCode !== undefined,
        input.declaredCurrencyCode ?? null,
        input.specialInstructions !== undefined,
        input.specialInstructions ?? null,
        input.estimatedPickupAt !== undefined,
        input.estimatedPickupAt ?? null,
        input.estimatedDeliveryAt !== undefined,
        input.estimatedDeliveryAt ?? null,
      ],
    );

    if (input.pickup || input.origin) {
      await insertEvent(client, {
        shipmentId,
        type: 'PICKUP_UPDATED',
        previousStatus: current.status,
        status: current.status,
        note: 'Pickup information updated',
        actorUserId: actor.userId,
      });
    }
    if (input.delivery || input.destination) {
      await insertEvent(client, {
        shipmentId,
        type: 'DELIVERY_UPDATED',
        previousStatus: current.status,
        status: current.status,
        note: 'Delivery information updated',
        actorUserId: actor.userId,
      });
    }
    if (input.items) {
      await client.query('DELETE FROM shipment_items WHERE shipment_id = $1', [shipmentId]);
      for (const item of input.items) {
        await insertItem(client, shipmentId, item, current.weightUnit, current.dimensionUnit);
      }
      await refreshTotals(client, shipmentId);
      await insertEvent(client, {
        shipmentId,
        type: 'PACKAGE_UPDATED',
        previousStatus: current.status,
        status: current.status,
        note: 'Shipment packages updated',
        actorUserId: actor.userId,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const updated = await loadShipment(pool, actor, shipmentId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.operatorOrganizationId,
    action:
      input.items && !changingStops
        ? 'SHIPMENT_PACKAGE_UPDATED'
        : changingStops
          ? stopAuditAction(input)
          : 'SHIPMENT_UPDATED',
    entityType: 'shipment',
    entityId: shipmentId,
    before: { status: current.status, priority: current.priority },
    after: { status: updated.status, priority: updated.priority },
  });
  return updated;
}

export async function updateShipmentStatus(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
  input: StatusInput,
) {
  const current = await loadShipment(pool, actor, shipmentId);
  if (!canTransitionShipment(current.status, input.status)) {
    throw new AppError(
      422,
      'SHIPMENT_INVALID_TRANSITION',
      `Cannot move a ${current.status} shipment to ${input.status}.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE shipments
        SET status = $2::shipment_status,
            actual_pickup_at = CASE
              WHEN $2::shipment_status = 'PICKED_UP' THEN COALESCE(actual_pickup_at, now())
              ELSE actual_pickup_at
            END,
            actual_delivery_at = CASE
              WHEN $2::shipment_status = 'DELIVERED' THEN COALESCE(actual_delivery_at, now())
              ELSE actual_delivery_at
            END,
            updated_at = now()
        WHERE id = $1
      `,
      [shipmentId, input.status],
    );
    await insertEvent(client, {
      shipmentId,
      type: input.status === 'CANCELLED' ? 'CANCELLED' : 'STATUS_CHANGED',
      previousStatus: current.status,
      status: input.status,
      note: input.note ?? `Status changed from ${current.status} to ${input.status}`,
      actorUserId: actor.userId,
      location: input.location,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const trackingType = trackingEventTypeForShipmentStatus(input.status);
    if (trackingType) {
      await insertTrackingEvent(client, {
        organizationId: current.operatorOrganizationId,
        type: trackingType,
        shipmentId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        description: input.note ?? `Shipment ${input.status.toLowerCase().replaceAll('_', ' ')}`,
        actorUserId: actor.userId,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.operatorOrganizationId,
    action: input.status === 'CANCELLED' ? 'SHIPMENT_CANCELLED' : 'SHIPMENT_STATUS_CHANGED',
    entityType: 'shipment',
    entityId: shipmentId,
    before: { status: current.status },
    after: { status: input.status },
  });
  const updated = await loadShipment(pool, actor, shipmentId);
  await notifyShipmentEvent(pool, updated, actor.userId);
  return updated;
}

export async function cancelShipment(pool: Pool, actor: AuthContext, shipmentId: string) {
  return updateShipmentStatus(pool, actor, shipmentId, {
    status: 'CANCELLED',
    note: 'Shipment cancelled',
  });
}

export async function archiveShipment(pool: Pool, actor: AuthContext, shipmentId: string) {
  const current = await loadShipment(pool, actor, shipmentId);
  if (
    current.status !== 'DRAFT' &&
    current.status !== 'CANCELLED' &&
    current.status !== 'DELIVERED'
  ) {
    throw unprocessable('Only draft, cancelled, or delivered shipments can be archived');
  }
  await pool.query('UPDATE shipments SET deleted_at = now(), updated_at = now() WHERE id = $1', [
    shipmentId,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.operatorOrganizationId,
    action: 'SHIPMENT_ARCHIVED',
    entityType: 'shipment',
    entityId: shipmentId,
    before: { reference: current.reference, status: current.status },
  });
  return { id: shipmentId, archived: true };
}

export async function addShipmentItem(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
  input: ItemInput,
) {
  const current = await loadShipment(pool, actor, shipmentId);
  assertCargoEditable(current.status);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await insertItem(
      client,
      shipmentId,
      input,
      current.weightUnit,
      current.dimensionUnit,
    );
    await refreshTotals(client, shipmentId);
    await insertEvent(client, {
      shipmentId,
      type: 'PACKAGE_ADDED',
      previousStatus: current.status,
      status: current.status,
      note: `Package added: ${input.description}`,
      actorUserId: actor.userId,
      metadata: { itemId: id },
    });
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: current.operatorOrganizationId,
      action: 'SHIPMENT_PACKAGE_ADDED',
      entityType: 'shipment_item',
      entityId: id,
      after: { shipmentId, description: input.description },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return loadShipment(pool, actor, shipmentId);
}

export async function updateShipmentItem(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
  itemId: string,
  input: Partial<ItemInput>,
) {
  const current = await loadShipment(pool, actor, shipmentId);
  assertCargoEditable(current.status);
  const existing = current.items.find((item) => item.id === itemId);
  if (!existing) {
    throw notFound('Package not found');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `
        UPDATE shipment_items
        SET description = COALESCE($3, description),
            quantity = COALESCE($4, quantity),
            weight_kg = CASE WHEN $5::boolean THEN $6 ELSE weight_kg END,
            weight_unit = COALESCE($7::weight_unit, weight_unit),
            length_cm = CASE WHEN $8::boolean THEN $9 ELSE length_cm END,
            width_cm = CASE WHEN $10::boolean THEN $11 ELSE width_cm END,
            height_cm = CASE WHEN $12::boolean THEN $13 ELSE height_cm END,
            dimension_unit = COALESCE($14::dimension_unit, dimension_unit),
            volume_m3 = CASE WHEN $15::boolean THEN $16 ELSE volume_m3 END,
            package_type = COALESCE($17::package_type, package_type),
            is_fragile = COALESCE($18, is_fragile),
            special_handling = CASE WHEN $19::boolean THEN $20 ELSE special_handling END
        WHERE id = $1 AND shipment_id = $2
      `,
      [
        itemId,
        shipmentId,
        input.description ?? null,
        input.quantity ?? null,
        input.weightKg !== undefined || input.weight !== undefined,
        input.weightKg ?? input.weight ?? null,
        input.weightUnit ?? null,
        input.lengthCm !== undefined || input.length !== undefined,
        input.lengthCm ?? input.length ?? null,
        input.widthCm !== undefined || input.width !== undefined,
        input.widthCm ?? input.width ?? null,
        input.heightCm !== undefined || input.height !== undefined,
        input.heightCm ?? input.height ?? null,
        input.dimensionUnit ?? null,
        input.volumeM3 !== undefined,
        input.volumeM3 ??
          computeVolumeM3(
            {
              ...existing,
              quantity: input.quantity ?? existing.quantity,
              lengthCm: input.lengthCm ?? input.length ?? existing.lengthCm,
              widthCm: input.widthCm ?? input.width ?? existing.widthCm,
              heightCm: input.heightCm ?? input.height ?? existing.heightCm,
              dimensionUnit: input.dimensionUnit ?? existing.dimensionUnit,
            },
            input.dimensionUnit ?? existing.dimensionUnit,
          ),
        input.packageType ?? null,
        input.isFragile ?? null,
        input.specialHandling !== undefined,
        input.specialHandling ?? null,
      ],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw notFound('Package not found');
    }
    await refreshTotals(client, shipmentId);
    await insertEvent(client, {
      shipmentId,
      type: 'PACKAGE_UPDATED',
      previousStatus: current.status,
      status: current.status,
      note: `Package updated: ${input.description ?? existing.description}`,
      actorUserId: actor.userId,
      metadata: { itemId },
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
    organizationId: current.operatorOrganizationId,
    action: 'SHIPMENT_PACKAGE_UPDATED',
    entityType: 'shipment_item',
    entityId: itemId,
  });
  return loadShipment(pool, actor, shipmentId);
}

export async function removeShipmentItem(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
  itemId: string,
) {
  const current = await loadShipment(pool, actor, shipmentId);
  assertCargoEditable(current.status);
  const existing = current.items.find((item) => item.id === itemId);
  if (!existing) {
    throw notFound('Package not found');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM shipment_items WHERE id = $1 AND shipment_id = $2', [
      itemId,
      shipmentId,
    ]);
    await refreshTotals(client, shipmentId);
    await insertEvent(client, {
      shipmentId,
      type: 'PACKAGE_REMOVED',
      previousStatus: current.status,
      status: current.status,
      note: `Package removed: ${existing.description}`,
      actorUserId: actor.userId,
      metadata: { itemId },
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
    organizationId: current.operatorOrganizationId,
    action: 'SHIPMENT_PACKAGE_REMOVED',
    entityType: 'shipment_item',
    entityId: itemId,
    before: { description: existing.description },
  });
  return loadShipment(pool, actor, shipmentId);
}

function assertCargoEditable(status: ShipmentStatus) {
  if (isCargoLocked(status)) {
    throw unprocessable('Packages cannot be changed after pickup');
  }
}

function normalizeStop(
  stop: StopInput | undefined,
  fallback: AddressRef | undefined,
  addressType: 'PICKUP' | 'DELIVERY',
) {
  if (stop) {
    const address: AddressRef = stop.addressId
      ? { addressId: stop.addressId }
      : {
          addressType,
          countryCode: stop.countryCode,
          label: stop.label,
          adminArea1: stop.adminArea1,
          adminArea2: stop.adminArea2,
          locality: stop.locality,
          subLocality: stop.subLocality,
          streetLine1: stop.streetLine1,
          streetLine2: stop.streetLine2,
          postalCode: stop.postalCode,
          landmark: stop.landmark,
          latitude: stop.latitude,
          longitude: stop.longitude,
          isDefault: stop.isDefault,
        };
    if (!('addressId' in address) && !address.streetLine1) {
      throw unprocessable(`${addressType === 'PICKUP' ? 'Pickup' : 'Delivery'} street is required`);
    }
    return {
      contactName: stop.contactName,
      phoneE164: stop.phoneE164,
      instructions: stop.instructions,
      address,
    };
  }
  if (!fallback) {
    throw unprocessable(`${addressType === 'PICKUP' ? 'Pickup' : 'Delivery'} address is required`);
  }
  return { address: fallback };
}

async function nextReference(client: PoolClient, countryCode: string) {
  const year = new Date().getUTCFullYear();
  const counter = await client.query<{ last_value: number }>(
    `
      INSERT INTO shipment_reference_counters (country_code, year, last_value)
      VALUES ($1, $2, 1)
      ON CONFLICT (country_code, year)
      DO UPDATE SET last_value = shipment_reference_counters.last_value + 1
      RETURNING last_value
    `,
    [countryCode, year],
  );
  const value = counter.rows[0]?.last_value ?? 1;
  return `MX-${countryCode}-${year}-${String(value).padStart(5, '0')}`;
}

async function resolveAddress(
  client: PoolClient,
  organizationId: string,
  input: AddressRef,
  addressType: 'PICKUP' | 'DELIVERY',
) {
  if ('addressId' in input) {
    const existing = await client.query<{ id: string; organization_id: string }>(
      'SELECT id, organization_id FROM addresses WHERE id = $1 AND deleted_at IS NULL',
      [input.addressId],
    );
    const row = existing.rows[0];
    if (!row || row.organization_id !== organizationId) {
      throw notFound('Address not found');
    }
    return row.id;
  }
  return insertAddress(client, organizationId, { ...input, addressType });
}

async function loadAddress(pool: Pool, addressId: string | null) {
  if (!addressId) {
    return null;
  }
  const result = await pool.query(
    `
      SELECT id, organization_id, label, address_type::text AS address_type, country_code,
             admin_area_1, admin_area_2, locality, sub_locality, street_line1, street_line2,
             postal_code, landmark, formatted_address, latitude, longitude, is_default
      FROM addresses WHERE id = $1
    `,
    [addressId],
  );
  return result.rows[0] ? mapAddress(result.rows[0]) : null;
}

async function countryOf(client: PoolClient, addressId: string) {
  const result = await client.query<{ country_code: string }>(
    'SELECT country_code FROM addresses WHERE id = $1',
    [addressId],
  );
  return result.rows[0]?.country_code ?? 'RW';
}

async function insertItem(
  client: PoolClient,
  shipmentId: string,
  item: ItemInput,
  defaultWeightUnit: string,
  defaultDimensionUnit: string,
) {
  const weightUnit = item.weightUnit ?? defaultWeightUnit;
  const dimensionUnit = item.dimensionUnit ?? defaultDimensionUnit;
  const weight = item.weightKg ?? item.weight ?? null;
  const length = item.lengthCm ?? item.length ?? null;
  const width = item.widthCm ?? item.width ?? null;
  const height = item.heightCm ?? item.height ?? null;
  const volume =
    item.volumeM3 ??
    computeVolumeM3(
      {
        quantity: item.quantity,
        lengthCm: length,
        widthCm: width,
        heightCm: height,
        dimensionUnit,
      },
      dimensionUnit,
    );
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO shipment_items (
        shipment_id, description, quantity, weight_kg, weight_unit,
        length_cm, width_cm, height_cm, dimension_unit, volume_m3,
        package_type, is_fragile, special_handling
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `,
    [
      shipmentId,
      item.description,
      item.quantity,
      weight,
      weightUnit,
      length,
      width,
      height,
      dimensionUnit,
      volume,
      item.packageType ?? 'CARTON',
      item.isFragile ?? false,
      item.specialHandling ?? null,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('Failed to create package');
  }
  return id;
}

async function refreshTotals(client: PoolClient, shipmentId: string) {
  await client.query(
    `
      UPDATE shipments
      SET pieces_count = COALESCE((
            SELECT sum(quantity) FROM shipment_items WHERE shipment_id = $1
          ), 0),
          weight_kg = (
            SELECT sum(
              COALESCE(weight_kg, 0) * quantity *
              CASE WHEN weight_unit = 'T' THEN 1000 ELSE 1 END
            )
            FROM shipment_items WHERE shipment_id = $1
          ),
          volume_m3 = (
            SELECT sum(COALESCE(volume_m3, 0)) FROM shipment_items WHERE shipment_id = $1
          ),
          updated_at = now()
      WHERE id = $1
    `,
    [shipmentId],
  );
}

async function insertEvent(
  client: PoolClient,
  input: {
    shipmentId: string;
    type: string;
    previousStatus: ShipmentStatus | null;
    status: ShipmentStatus;
    note: string;
    actorUserId: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      INSERT INTO shipment_events (
        shipment_id, event_type, previous_status, status, note, actor_user_id,
        location_label, latitude, longitude, metadata
      )
      VALUES (
        $1, $2, $3::shipment_status, $4::shipment_status, $5, $6, $7, $8, $9, $10::jsonb
      )
    `,
    [
      input.shipmentId,
      input.type,
      input.previousStatus,
      input.status,
      input.note,
      input.actorUserId,
      input.location ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

function applyTenantFilter(actor: AuthContext, where: string[], params: unknown[], alias: string) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`${alias}.operator_organization_id = $${params.length}`);
    return;
  }
  params.push(actor.orgId);
  where.push(`${alias}.customer_organization_id = $${params.length}`);
}

function assertShipmentAccess(actor: AuthContext, customerId: string, operatorId: string) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR' && actor.orgId === operatorId) {
    return;
  }
  if (actor.orgType === 'CUSTOMER' && actor.orgId === customerId) {
    return;
  }
  throw forbidden('You do not have access to this shipment');
}

async function resolveCustomerId(pool: Pool, actor: AuthContext, requested?: string) {
  if (actor.orgType === 'CUSTOMER') {
    return actor.orgId;
  }
  if (!requested) {
    throw forbidden('customerOrganizationId is required');
  }
  const found = await pool.query<{
    id: string;
    parent_organization_id: string | null;
    preferred_operator_organization_id: string | null;
  }>(
    `
      SELECT o.id, o.parent_organization_id, p.preferred_operator_organization_id
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE o.id = $1 AND o.type = 'CUSTOMER' AND o.deleted_at IS NULL
    `,
    [requested],
  );
  const row = found.rows[0];
  if (!row) {
    throw notFound('Customer not found');
  }
  if (
    actor.orgType === 'OPERATOR' &&
    row.parent_organization_id !== actor.orgId &&
    row.preferred_operator_organization_id !== actor.orgId
  ) {
    throw forbidden('Customer is not linked to your organization');
  }
  return row.id;
}

async function resolveOperatorForCustomer(pool: Pool, actor: AuthContext, customerId: string) {
  if (actor.orgType === 'OPERATOR') {
    return actor.orgId;
  }
  const profile = await pool.query<{ preferred_operator_organization_id: string | null }>(
    'SELECT preferred_operator_organization_id FROM customer_profiles WHERE organization_id = $1',
    [customerId],
  );
  if (profile.rows[0]?.preferred_operator_organization_id) {
    return profile.rows[0].preferred_operator_organization_id;
  }
  const org = await pool.query<{ parent_organization_id: string | null }>(
    'SELECT parent_organization_id FROM organizations WHERE id = $1',
    [customerId],
  );
  if (org.rows[0]?.parent_organization_id) {
    return org.rows[0].parent_organization_id;
  }
  const fallback = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE type = 'OPERATOR' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  const id = fallback.rows[0]?.id;
  if (!id) {
    throw notFound('No operator organization is configured');
  }
  return id;
}

function summarizeItems(items: ItemInput[], weightUnit: string, dimensionUnit: string) {
  let piecesCount = 0;
  let weightKg = 0;
  let volumeM3 = 0;
  for (const item of items) {
    piecesCount += item.quantity;
    const rawWeight = item.weightKg ?? item.weight;
    if (rawWeight != null) {
      const unit = item.weightUnit ?? weightUnit;
      weightKg += rawWeight * item.quantity * (unit === 'T' ? 1000 : 1);
    }
    const volume =
      item.volumeM3 ??
      computeVolumeM3(
        {
          quantity: item.quantity,
          lengthCm: item.lengthCm ?? item.length,
          widthCm: item.widthCm ?? item.width,
          heightCm: item.heightCm ?? item.height,
          dimensionUnit: item.dimensionUnit ?? dimensionUnit,
        },
        item.dimensionUnit ?? dimensionUnit,
      );
    if (volume != null) {
      volumeM3 += volume;
    }
  }
  return {
    piecesCount: items.length > 0 ? piecesCount : null,
    weightKg: items.length > 0 ? weightKg : null,
    volumeM3: items.length > 0 ? volumeM3 : null,
  };
}

function computeVolumeM3(
  item: {
    quantity: number;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
    dimensionUnit?: string | null;
  },
  dimensionUnit: string,
) {
  if (item.lengthCm == null || item.widthCm == null || item.heightCm == null) {
    return null;
  }
  const factor = (item.dimensionUnit ?? dimensionUnit) === 'M' ? 1 : 0.01;
  return item.lengthCm * factor * item.widthCm * factor * item.heightCm * factor * item.quantity;
}

function mapItem(row: Record<string, unknown>): ShipmentItemPayload {
  const weightKg = toNumber(row.weight_kg as string | null);
  const lengthCm = toNumber(row.length_cm as string | null);
  const widthCm = toNumber(row.width_cm as string | null);
  const heightCm = toNumber(row.height_cm as string | null);
  return {
    id: String(row.id),
    description: String(row.description),
    quantity: Number(row.quantity),
    weight: weightKg,
    weightKg,
    weightUnit: String(row.weight_unit ?? 'KG'),
    length: lengthCm,
    width: widthCm,
    height: heightCm,
    lengthCm,
    widthCm,
    heightCm,
    dimensionUnit: String(row.dimension_unit ?? 'CM'),
    volumeM3: toNumber(row.volume_m3 as string | null),
    packageType: String(row.package_type ?? 'CARTON'),
    isFragile: Boolean(row.is_fragile),
    specialHandling: (row.special_handling as string | null) ?? null,
  };
}

function mapEvent(row: Record<string, unknown>): ShipmentEventPayload {
  return {
    id: String(row.id),
    type: String(row.event_type),
    previousStatus: (row.previous_status as ShipmentStatus | null) ?? null,
    status: (row.status as ShipmentStatus | null) ?? null,
    note: (row.note as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? null,
    location: (row.location_label as string | null) ?? null,
    latitude: toNumber(row.latitude as string | null),
    longitude: toNumber(row.longitude as string | null),
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    occurredAt: (row.occurred_at as Date).toISOString(),
  };
}

function stopAuditAction(input: UpdateShipmentInput) {
  if (input.pickup && input.delivery) {
    return 'SHIPMENT_UPDATED';
  }
  if (input.pickup || input.origin) {
    return 'SHIPMENT_PICKUP_UPDATED';
  }
  if (input.delivery || input.destination) {
    return 'SHIPMENT_DELIVERY_UPDATED';
  }
  return 'SHIPMENT_UPDATED';
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}
