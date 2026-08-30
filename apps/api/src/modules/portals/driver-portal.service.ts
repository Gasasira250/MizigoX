import type {
  DriverDashboardPayload,
  DriverShipmentSummary,
  DriverStopSummary,
  DriverTripBucket,
  DriverTripDetailPayload,
  DriverTripSummary,
  DriverTripsPayload,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { getLinkedDriver } from '../../lib/linked-driver.js';
import type { AuthContext } from '../auth/auth.types.js';
import { loadRoute, updateRouteStatus, updateRouteStop } from '../routes/route.service.js';
import { getMyTrackingAssignment } from '../tracking/tracking.service.js';

const CURRENT_STATUSES = ['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'];
const UPCOMING_STATUSES = ['PLANNED', 'READY'];
const COMPLETED_STATUSES = ['COMPLETED'];

export async function getDriverDashboard(
  pool: Pool,
  actor: AuthContext,
): Promise<DriverDashboardPayload> {
  const driver = await requireDriver(pool, actor);
  const trips = await listDriverTrips(pool, actor);
  const current = trips.current[0] ?? null;
  const detail = current ? await getDriverTrip(pool, actor, current.id) : null;
  const nextStop =
    detail?.stops.find((stop) => stop.status === 'ARRIVED') ??
    detail?.stops.find((stop) => stop.status === 'PENDING') ??
    null;
  const assignment = await getMyTrackingAssignment(pool, actor).catch(() => null);

  return {
    driverId: driver.id,
    driverName: driver.name,
    status: driver.status,
    currentAssignment: current,
    nextStop,
    shipmentCount: detail?.shipmentCount ?? current?.shipmentCount ?? 0,
    instructions: detail?.instructions ?? current?.notes ?? null,
    tracking: {
      supported: true,
      backgroundTrackingSupported: false,
      permissionState: 'unknown',
      trackingEnabled: false,
      lastLocation: assignment?.currentLocation ?? null,
    },
  };
}

export async function listDriverTrips(pool: Pool, actor: AuthContext): Promise<DriverTripsPayload> {
  const driver = await requireDriver(pool, actor);
  const result = await pool.query(tripSelect() + ` WHERE r.driver_id = $1 AND r.deleted_at IS NULL ORDER BY r.updated_at DESC`, [
    driver.id,
  ]);
  const trips = result.rows.map(mapTripSummary);
  return {
    current: trips.filter((trip) => trip.bucket === 'current'),
    upcoming: trips.filter((trip) => trip.bucket === 'upcoming'),
    completed: trips.filter((trip) => trip.bucket === 'completed').slice(0, 20),
  };
}

export async function getDriverTrip(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
): Promise<DriverTripDetailPayload> {
  const driver = await requireDriver(pool, actor);
  await assertAssignedRoute(pool, driver.id, routeId);
  const route = await loadRoute(pool, actor, routeId);
  const summary = await pool.query(tripSelect() + ` WHERE r.id = $1 AND r.deleted_at IS NULL`, [routeId]);
  const trip = summary.rows[0] ? mapTripSummary(summary.rows[0]) : mapTripFromRoute(route);

  const stops: DriverStopSummary[] = route.stops.map((stop) => ({
    id: stop.id,
    sequence: stop.sequence,
    stopType: stop.stopType,
    status: stop.status,
    formattedAddress: stop.formattedAddress,
    contactName: stop.contactName,
    contactPhone: stop.contactPhone,
    instructions: stop.instructions,
    shipmentId: stop.shipmentId,
    shipmentReference: stop.shipmentReference,
  }));

  const shipmentIds = [...new Set(stops.map((stop) => stop.shipmentId).filter(Boolean))] as string[];
  const shipments = shipmentIds.length
    ? await pool.query(
        `
          SELECT s.id, s.reference, s.status::text AS status, c.name AS customer_name,
                 s.cargo_description, s.pieces_count, s.delivery_contact_name, s.delivery_phone_e164,
                 s.special_instructions,
                 da.formatted_address AS delivery_address,
                 oa.formatted_address AS pickup_address
          FROM shipments s
          JOIN organizations c ON c.id = s.customer_organization_id
          LEFT JOIN addresses da ON da.id = s.destination_address_id
          LEFT JOIN addresses oa ON oa.id = s.origin_address_id
          WHERE s.id = ANY($1::uuid[])
        `,
        [shipmentIds],
      )
    : { rows: [] };

  return {
    ...trip,
    stops,
    instructions: route.notes,
    shipments: shipments.rows.map(
      (row): DriverShipmentSummary => ({
        id: String(row.id),
        reference: String(row.reference),
        status: String(row.status),
        customerName: String(row.customer_name),
        cargoDescription: (row.cargo_description as string | null) ?? null,
        piecesCount: row.pieces_count == null ? null : Number(row.pieces_count),
        deliveryContactName: (row.delivery_contact_name as string | null) ?? null,
        deliveryPhone: (row.delivery_phone_e164 as string | null) ?? null,
        deliveryAddress: (row.delivery_address as string | null) ?? null,
        pickupAddress: (row.pickup_address as string | null) ?? null,
        specialInstructions: (row.special_instructions as string | null) ?? null,
      }),
    ),
  };
}

export async function acceptDriverTrip(pool: Pool, actor: AuthContext, routeId: string) {
  const driver = await requireDriver(pool, actor);
  await assertAssignedRoute(pool, driver.id, routeId);
  const route = await loadRoute(pool, actor, routeId);
  if (route.status !== 'DISPATCHED' && route.status !== 'READY') {
    throw unprocessable('Only assigned dispatched or ready trips can be accepted');
  }
  const current = await pool.query<{ accepted_at: Date | null }>(
    `SELECT accepted_at FROM routes WHERE id = $1`,
    [routeId],
  );
  if (current.rows[0]?.accepted_at) {
    throw conflict('This trip has already been accepted');
  }
  await pool.query(
    `
      UPDATE routes
      SET accepted_at = now(), accepted_by_driver_id = $2
      WHERE id = $1
    `,
    [routeId, driver.id],
  );
  await pool.query(
    `
      INSERT INTO route_events (route_id, organization_id, event_type, status, description, actor_user_id)
      VALUES ($1, $2, 'TRIP_ACCEPTED', $3, 'Driver accepted the trip', $4)
    `,
    [routeId, route.organizationId, route.status, actor.userId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: route.organizationId,
    action: 'TRIP_ACCEPTED',
    entityType: 'route',
    entityId: routeId,
  });
  return getDriverTrip(pool, actor, routeId);
}

export async function startDriverTrip(pool: Pool, actor: AuthContext, routeId: string) {
  const driver = await requireDriver(pool, actor);
  await assertAssignedRoute(pool, driver.id, routeId);
  const route = await loadRoute(pool, actor, routeId);
  const accepted = await pool.query<{ accepted_at: Date | null }>(
    `SELECT accepted_at FROM routes WHERE id = $1`,
    [routeId],
  );
  if (!accepted.rows[0]?.accepted_at) {
    throw unprocessable('Accept the trip before starting it');
  }
  if (route.status !== 'DISPATCHED') {
    throw unprocessable('Only a dispatched trip can be started');
  }
  await updateRouteStatus(pool, actor, routeId, { status: 'IN_TRANSIT', note: 'Driver started trip' });
  return getDriverTrip(pool, actor, routeId);
}

export async function arriveDriverStop(pool: Pool, actor: AuthContext, stopId: string) {
  const { routeId, stop } = await loadAssignedStop(pool, actor, stopId);
  if (stop.status !== 'PENDING') {
    throw unprocessable('Only a pending stop can be marked arrived');
  }
  const route = await loadRoute(pool, actor, routeId);
  if (route.status !== 'IN_TRANSIT' && route.status !== 'ARRIVED') {
    throw unprocessable('Start the trip before arriving at a stop');
  }
  await updateRouteStop(pool, actor, routeId, stopId, { status: 'ARRIVED' });
  return getDriverTrip(pool, actor, routeId);
}

export async function completeDriverStop(pool: Pool, actor: AuthContext, stopId: string) {
  const { routeId, stop } = await loadAssignedStop(pool, actor, stopId);
  if (stop.status !== 'ARRIVED') {
    throw unprocessable('Arrive at the stop before completing it');
  }
  await updateRouteStop(pool, actor, routeId, stopId, { status: 'SERVICED' });
  return getDriverTrip(pool, actor, routeId);
}

export async function completeDriverTrip(pool: Pool, actor: AuthContext, routeId: string) {
  const driver = await requireDriver(pool, actor);
  await assertAssignedRoute(pool, driver.id, routeId);
  const trip = await getDriverTrip(pool, actor, routeId);
  const unfinished = trip.stops.filter((stop) => stop.status !== 'SERVICED' && stop.status !== 'SKIPPED');
  if (unfinished.length > 0) {
    throw unprocessable('Complete every stop before completing the trip');
  }
  const route = await loadRoute(pool, actor, routeId);
  if (route.status === 'IN_TRANSIT') {
    await updateRouteStatus(pool, actor, routeId, { status: 'ARRIVED', note: 'Driver arrived at final stop' });
  }
  const latest = await loadRoute(pool, actor, routeId);
  if (latest.status === 'ARRIVED') {
    await updateRouteStatus(pool, actor, routeId, { status: 'COMPLETED', note: 'Driver completed the trip' });
  }
  return getDriverTrip(pool, actor, routeId);
}

async function requireDriver(pool: Pool, actor: AuthContext) {
  if (actor.role !== 'DRIVER') {
    throw forbidden('This action is only available to driver accounts');
  }
  const driver = await getLinkedDriver(pool, actor, { required: true });
  return driver!;
}

async function assertAssignedRoute(pool: Pool, driverId: string, routeId: string) {
  const found = await pool.query(
    `SELECT id FROM routes WHERE id = $1 AND driver_id = $2 AND deleted_at IS NULL`,
    [routeId, driverId],
  );
  if (!found.rows[0]) {
    throw forbidden('You are not assigned to this trip');
  }
}

async function loadAssignedStop(pool: Pool, actor: AuthContext, stopId: string) {
  const driver = await requireDriver(pool, actor);
  const result = await pool.query<{
    id: string;
    route_id: string;
    status: string;
    sequence: number;
  }>(
    `
      SELECT rs.id, rs.route_id, rs.status::text AS status, rs.sequence
      FROM route_stops rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.id = $1 AND rs.deleted_at IS NULL AND r.driver_id = $2 AND r.deleted_at IS NULL
    `,
    [stopId, driver.id],
  );
  const stop = result.rows[0];
  if (!stop) {
    throw notFound('Stop not found');
  }
  return {
    routeId: stop.route_id,
    stop: { id: stop.id, status: stop.status, sequence: stop.sequence },
  };
}

function tripSelect() {
  return `
    SELECT r.id, r.reference, r.status::text AS status, r.origin_text, r.destination_text,
           r.planned_departure_at, r.accepted_at, r.notes,
           v.registration_number,
           (SELECT count(*) FROM route_shipments rs WHERE rs.route_id = r.id) AS shipment_count,
           (SELECT count(*) FROM route_stops st WHERE st.route_id = r.id AND st.deleted_at IS NULL) AS stop_count
    FROM routes r
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
  `;
}

function bucketFor(status: string): DriverTripBucket {
  if (CURRENT_STATUSES.includes(status)) return 'current';
  if (UPCOMING_STATUSES.includes(status)) return 'upcoming';
  if (COMPLETED_STATUSES.includes(status)) return 'completed';
  return 'upcoming';
}

function mapTripSummary(row: Record<string, unknown>): DriverTripSummary {
  const status = String(row.status);
  return {
    id: String(row.id),
    reference: String(row.reference),
    status,
    bucket: bucketFor(status),
    origin: (row.origin_text as string | null) ?? null,
    destination: (row.destination_text as string | null) ?? null,
    plannedDepartureAt: row.planned_departure_at
      ? new Date(row.planned_departure_at as string).toISOString()
      : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at as string).toISOString() : null,
    vehicleRegistration: (row.registration_number as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    shipmentCount: Number(row.shipment_count ?? 0),
    stopCount: Number(row.stop_count ?? 0),
  };
}

function mapTripFromRoute(route: {
  id: string;
  reference: string;
  status: string;
  origin: string | null;
  destination: string | null;
  plannedDepartureAt: string | null;
  notes: string | null;
  vehicleRegistration: string | null;
  shipmentCount: number;
  stops: unknown[];
}): DriverTripSummary {
  return {
    id: route.id,
    reference: route.reference,
    status: route.status,
    bucket: bucketFor(route.status),
    origin: route.origin,
    destination: route.destination,
    plannedDepartureAt: route.plannedDepartureAt,
    acceptedAt: null,
    vehicleRegistration: route.vehicleRegistration,
    notes: route.notes,
    shipmentCount: route.shipmentCount,
    stopCount: route.stops.length,
  };
}
