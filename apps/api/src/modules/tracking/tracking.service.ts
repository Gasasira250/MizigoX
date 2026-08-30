import {
  locationAgeSeconds,
  trackingFreshness,
  type AuthenticatedShipmentTrackingPayload,
  type DriverTrackingAssignmentPayload,
  type LocationRecordPayload,
  type LocationSource,
  type LiveTrackingDashboardPayload,
  type MapProvider,
  type PublicShipmentTrackingPayload,
  type RouteTrackingPayload,
  type ShipmentTrackingTokenPayload,
  type TrackingConfigPayload,
  type TrackingEventPayload,
  type TrackingEventType,
  type TrackingFreshness,
  type VehicleLocationPayload,
} from '@mizigox/shared';
import { createOpaqueToken, hashToken } from '../../lib/crypto.js';
import { writeAudit } from '../../lib/audit.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { getEnv } from '../../config/env.js';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../auth/auth.types.js';
import { applyOperatorFilter, assertOperatorAccess } from '../fleet/tenant.js';
import { emitNotification } from '../notifications/notify.js';
import { publishVehicleLocation } from './tracking.hub.js';
import type { z } from 'zod';
import type {
  liveDashboardQuerySchema,
  listLocationsQuerySchema,
  submitLocationSchema,
  trackingEventsQuerySchema,
} from './tracking.schemas.js';

type SubmitInput = z.infer<typeof submitLocationSchema>;
type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
type LiveQuery = z.infer<typeof liveDashboardQuerySchema>;
type EventsQuery = z.infer<typeof trackingEventsQuerySchema>;

const ACTIVE_ROUTE_STATUSES = ['DISPATCHED', 'IN_TRANSIT', 'ARRIVED'];
const INACTIVE_DRIVER_STATUSES = ['INACTIVE', 'SUSPENDED'];

export function trackingThresholds() {
  const env = getEnv();
  return {
    liveSeconds: env.TRACKING_LIVE_SECONDS,
    recentSeconds: env.TRACKING_RECENT_SECONDS,
    staleSeconds: env.TRACKING_STALE_SECONDS,
  };
}

export function mapConfig(): { provider: MapProvider; publicKey: string | null } {
  const env = getEnv();
  if (env.MAP_PROVIDER === 'mapbox') {
    return { provider: 'mapbox', publicKey: env.MAPBOX_ACCESS_TOKEN ?? null };
  }
  if (env.MAP_PROVIDER === 'google') {
    return { provider: 'google', publicKey: env.GOOGLE_MAPS_API_KEY ?? null };
  }
  return { provider: env.MAP_PROVIDER, publicKey: null };
}

export function getTrackingConfig(): TrackingConfigPayload {
  return { thresholds: trackingThresholds(), map: mapConfig() };
}

export async function submitLocation(pool: Pool, actor: AuthContext, input: SubmitInput) {
  const env = getEnv();
  const deviceAt = resolveDeviceTimestamp(
    input.deviceTimestamp,
    env.TRACKING_MAX_FUTURE_SKEW_SECONDS,
    env.TRACKING_MAX_AGE_SECONDS,
  );
  const assignment = await resolveAuthorizedAssignment(pool, actor, input);
  const source = (input.source ??
    (actor.role === 'DRIVER' ? 'DRIVER_WEB' : 'OPERATIONS')) as LocationSource;

  const client = await pool.connect();
  let locationId: string;
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO location_records (
          organization_id, vehicle_id, driver_id, route_id, shipment_id,
          latitude, longitude, accuracy_meters, speed_kph, heading_degrees,
          altitude_meters, battery_percent, source, device_timestamp, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
        RETURNING id
      `,
      [
        assignment.organizationId,
        assignment.vehicleId,
        assignment.driverId,
        assignment.routeId,
        assignment.shipmentId,
        input.latitude,
        input.longitude,
        input.accuracyMeters ?? null,
        input.speedKph ?? null,
        input.headingDegrees ?? null,
        input.altitudeMeters ?? null,
        input.batteryPercent ?? null,
        source,
        deviceAt.toISOString(),
        JSON.stringify({
          ...(input.metadata ?? {}),
          deviceLabel: input.deviceLabel ?? null,
        }),
      ],
    );
    locationId = inserted.rows[0]!.id;
    await client.query(
      `
        INSERT INTO vehicle_current_locations (
          vehicle_id, organization_id, driver_id, route_id, shipment_id,
          latitude, longitude, accuracy_meters, speed_kph, heading_degrees,
          source, last_updated_at, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
        ON CONFLICT (vehicle_id) DO UPDATE
        SET organization_id = EXCLUDED.organization_id,
            driver_id = EXCLUDED.driver_id,
            route_id = EXCLUDED.route_id,
            shipment_id = EXCLUDED.shipment_id,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            accuracy_meters = EXCLUDED.accuracy_meters,
            speed_kph = EXCLUDED.speed_kph,
            heading_degrees = EXCLUDED.heading_degrees,
            source = EXCLUDED.source,
            last_updated_at = EXCLUDED.last_updated_at,
            received_at = now()
      `,
      [
        assignment.vehicleId,
        assignment.organizationId,
        assignment.driverId,
        assignment.routeId,
        assignment.shipmentId,
        input.latitude,
        input.longitude,
        input.accuracyMeters ?? null,
        input.speedKph ?? null,
        input.headingDegrees ?? null,
        source,
        deviceAt.toISOString(),
      ],
    );
    if (
      await shouldRecordLocationEvent(client, assignment.vehicleId, input.latitude, input.longitude)
    ) {
      await insertTrackingEvent(client, {
        organizationId: assignment.organizationId,
        type: 'LOCATION_UPDATED',
        vehicleId: assignment.vehicleId,
        driverId: assignment.driverId,
        routeId: assignment.routeId,
        shipmentId: assignment.shipmentId,
        latitude: input.latitude,
        longitude: input.longitude,
        description: 'Location updated',
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

  const latest = await getLatestVehicleLocation(pool, actor, assignment.vehicleId);
  if (latest) {
    publishVehicleLocation(latest);
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: assignment.organizationId,
    action: 'TRACKING_LOCATION_SUBMITTED',
    entityType: 'location_record',
    entityId: locationId,
    after: {
      vehicleId: assignment.vehicleId,
      routeId: assignment.routeId,
      latitude: input.latitude,
      longitude: input.longitude,
    },
  });
  return latest;
}

export async function getLatestVehicleLocation(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
): Promise<VehicleLocationPayload | null> {
  const result = await pool.query(latestLocationSql(), [vehicleId]);
  const row = result.rows[0];
  if (!row) {
    if (actor.orgType === 'CUSTOMER' || actor.role === 'DRIVER') {
      throw notFound('Vehicle location not found');
    }
    await assertVehicleReadable(pool, actor, vehicleId);
    return null;
  }
  await assertCanViewVehicleLocation(pool, actor, {
    organizationId: String(row.organization_id),
    driverId: (row.driver_id as string | null) ?? null,
    routeId: (row.route_id as string | null) ?? null,
  });
  return mapVehicleLocation(row);
}

export async function listLocationHistory(
  pool: Pool,
  actor: AuthContext,
  query: ListLocationsQuery,
) {
  const params: unknown[] = [];
  const where = ['1=1'];
  await applyTrackingVisibility(pool, actor, where, params, {
    orgColumn: 'lr.organization_id',
    driverColumn: 'lr.driver_id',
    routeColumn: 'lr.route_id',
    shipmentColumn: 'lr.shipment_id',
  });
  if (query.vehicleId) {
    params.push(query.vehicleId);
    where.push(`lr.vehicle_id = $${params.length}`);
  }
  if (query.driverId) {
    params.push(query.driverId);
    where.push(`lr.driver_id = $${params.length}`);
  }
  if (query.routeId) {
    params.push(query.routeId);
    where.push(`lr.route_id = $${params.length}`);
  }
  if (query.shipmentId) {
    params.push(query.shipmentId);
    where.push(`lr.shipment_id = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`lr.received_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`lr.received_at <= $${params.length}`);
  }

  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM location_records lr WHERE ${where.join(' AND ')}`,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT lr.id, lr.organization_id, lr.vehicle_id, lr.driver_id, lr.route_id, lr.shipment_id,
             lr.latitude, lr.longitude, lr.accuracy_meters, lr.speed_kph, lr.heading_degrees,
             lr.altitude_meters, lr.battery_percent, lr.source, lr.device_timestamp,
             lr.received_at, lr.metadata
      FROM location_records lr
      WHERE ${where.join(' AND ')}
      ORDER BY lr.received_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  return {
    locations: result.rows.map(mapLocationRecord),
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getRouteTracking(
  pool: Pool,
  actor: AuthContext,
  routeId: string,
): Promise<RouteTrackingPayload> {
  const route = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.origin_text, r.destination_text,
             r.organization_id, r.vehicle_id, r.driver_id,
             v.registration_number,
             NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name
      FROM routes r
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      LEFT JOIN drivers d ON d.id = r.driver_id
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `,
    [routeId],
  );
  const row = route.rows[0];
  if (!row) {
    throw notFound('Route not found');
  }
  await assertCanViewVehicleLocation(pool, actor, {
    organizationId: String(row.organization_id),
    driverId: (row.driver_id as string | null) ?? null,
    routeId,
  });
  if (actor.orgType === 'CUSTOMER') {
    await assertCustomerOwnsRoute(pool, actor.orgId, routeId);
  }

  const stops = await pool.query(
    `
      SELECT id, sequence, stop_type::text AS stop_type, status::text AS status,
             formatted_address, latitude, longitude
      FROM route_stops
      WHERE route_id = $1 AND deleted_at IS NULL
      ORDER BY sequence
    `,
    [routeId],
  );
  const current = stops.rows.find((stop) => stop.status === 'ARRIVED') ?? null;
  const next =
    stops.rows.find((stop) => stop.status === 'PENDING') ??
    stops.rows.find((stop) => stop.status !== 'SERVICED' && stop.status !== 'SKIPPED') ??
    null;
  const location = row.vehicle_id
    ? await getLatestVehicleLocation(pool, actor, String(row.vehicle_id))
    : null;

  return {
    routeId: String(row.id),
    reference: String(row.reference),
    status: String(row.status),
    origin: (row.origin_text as string | null) ?? null,
    destination: (row.destination_text as string | null) ?? null,
    driverId: (row.driver_id as string | null) ?? null,
    driverName: (row.driver_name as string | null) ?? null,
    vehicleId: (row.vehicle_id as string | null) ?? null,
    vehicleRegistration: (row.registration_number as string | null) ?? null,
    currentLocation: location,
    currentStopId: current ? String(current.id) : null,
    nextStopId: next ? String(next.id) : null,
    stops: stops.rows.map((stop) => ({
      id: String(stop.id),
      sequence: Number(stop.sequence),
      stopType: String(stop.stop_type),
      status: String(stop.status),
      formattedAddress: String(stop.formatted_address),
      latitude: toNumber(stop.latitude),
      longitude: toNumber(stop.longitude),
    })),
    lastUpdatedAt: location?.lastUpdatedAt ?? null,
    freshness: location?.freshness ?? 'OFFLINE',
  };
}

export async function getShipmentTracking(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
): Promise<AuthenticatedShipmentTrackingPayload> {
  const shipment = await pool.query(
    `
      SELECT s.id, s.reference, s.status::text AS status, s.operator_organization_id,
             s.customer_organization_id, s.estimated_delivery_at,
             c.name AS customer_name,
             oa.formatted_address AS origin_address,
             da.formatted_address AS destination_address
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      LEFT JOIN addresses oa ON oa.id = s.origin_address_id
      LEFT JOIN addresses da ON da.id = s.destination_address_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `,
    [shipmentId],
  );
  const row = shipment.rows[0];
  if (!row) {
    throw notFound('Shipment not found');
  }
  if (actor.role === 'DRIVER') {
    const driver = await resolveActorDriver(pool, actor);
    const assigned = await pool.query(
      `
        SELECT r.id
        FROM route_shipments rs
        JOIN routes r ON r.id = rs.route_id
        WHERE rs.shipment_id = $1 AND r.deleted_at IS NULL AND r.driver_id = $2
        LIMIT 1
      `,
      [shipmentId, driver?.id ?? null],
    );
    if (!assigned.rows[0]) {
      throw forbidden('You do not have access to this tracking record');
    }
  } else if (actor.orgType === 'PLATFORM') {
    // platform operations can inspect any shipment they can already read
  } else if (actor.orgType === 'OPERATOR' && actor.orgId === String(row.operator_organization_id)) {
    // same-operator access
  } else if (actor.orgType === 'CUSTOMER' && actor.orgId === String(row.customer_organization_id)) {
    // customer of this shipment
  } else {
    throw forbidden('You do not have access to this tracking record');
  }

  const route = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.vehicle_id
      FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = $1 AND r.deleted_at IS NULL
        AND r.status::text NOT IN ('COMPLETED', 'CANCELLED')
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [shipmentId],
  );
  const currentRoute = route.rows[0] ?? null;
  const location = currentRoute?.vehicle_id
    ? await getLatestVehicleLocation(pool, actor, String(currentRoute.vehicle_id))
    : null;
  const events = await listTrackingEvents(pool, actor, {
    shipmentId,
    page: 1,
    pageSize: 50,
  });
  const token = await pool.query<{ token_hint: string; revoked_at: Date | null }>(
    `
      SELECT token_hint, revoked_at
      FROM shipment_tracking_tokens
      WHERE shipment_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shipmentId],
  );

  return {
    shipmentId: String(row.id),
    reference: String(row.reference),
    status: String(row.status),
    customerName: String(row.customer_name),
    pickupAddress: (row.origin_address as string | null) ?? null,
    destinationAddress: (row.destination_address as string | null) ?? null,
    route: currentRoute
      ? {
          id: String(currentRoute.id),
          reference: String(currentRoute.reference),
          status: String(currentRoute.status),
        }
      : null,
    currentLocation: location,
    estimatedArrivalAt: row.estimated_delivery_at
      ? new Date(row.estimated_delivery_at as Date).toISOString()
      : null,
    lastUpdatedAt: location?.lastUpdatedAt ?? null,
    events: events.events,
    trackingTokenHint: token.rows[0]?.revoked_at ? null : (token.rows[0]?.token_hint ?? null),
    hasActiveTrackingToken: Boolean(token.rows[0] && !token.rows[0].revoked_at),
  };
}

export async function getPublicShipmentTracking(
  pool: Pool,
  rawToken: string,
): Promise<PublicShipmentTrackingPayload> {
  const hashed = hashToken(rawToken);
  const found = await pool.query(
    `
      SELECT t.shipment_id, t.revoked_at
      FROM shipment_tracking_tokens t
      WHERE t.token_hash = $1
    `,
    [hashed],
  );
  const tokenRow = found.rows[0];
  if (!tokenRow || tokenRow.revoked_at) {
    throw notFound('Tracking link is invalid or has been revoked');
  }

  const shipment = await pool.query(
    `
      SELECT s.reference, s.status::text AS status, s.estimated_delivery_at,
             s.pickup_contact_name, s.delivery_contact_name,
             oa.formatted_address AS origin_address,
             da.formatted_address AS destination_address
      FROM shipments s
      LEFT JOIN addresses oa ON oa.id = s.origin_address_id
      LEFT JOIN addresses da ON da.id = s.destination_address_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `,
    [tokenRow.shipment_id],
  );
  const row = shipment.rows[0];
  if (!row) {
    throw notFound('Tracking link is invalid or has been revoked');
  }

  const route = await pool.query(
    `
      SELECT r.status::text AS status, r.vehicle_id
      FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = $1 AND r.deleted_at IS NULL
        AND r.status::text NOT IN ('COMPLETED', 'CANCELLED')
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [tokenRow.shipment_id],
  );
  let currentLocation: PublicShipmentTrackingPayload['currentLocation'] = null;
  if (route.rows[0]?.vehicle_id) {
    const latest = await pool.query(latestLocationSql(), [route.rows[0].vehicle_id]);
    if (latest.rows[0]) {
      const mapped = mapVehicleLocation(latest.rows[0]);
      currentLocation = {
        latitude: mapped.latitude,
        longitude: mapped.longitude,
        lastUpdatedAt: mapped.lastUpdatedAt,
        freshness: mapped.freshness,
        ageSeconds: mapped.ageSeconds,
      };
    }
  }

  const events = await pool.query(
    `
      SELECT event_type, description, occurred_at
      FROM tracking_events
      WHERE shipment_id = $1
        AND event_type <> 'LOCATION_UPDATED'
      ORDER BY occurred_at ASC
    `,
    [tokenRow.shipment_id],
  );
  const shipmentEvents = await pool.query(
    `
      SELECT event_type, status::text AS status, note, occurred_at
      FROM shipment_events
      WHERE shipment_id = $1
      ORDER BY occurred_at ASC
    `,
    [tokenRow.shipment_id],
  );

  const timeline = [
    ...shipmentEvents.rows.map((event) => ({
      type: String(event.event_type),
      description: (event.note as string | null) ?? null,
      status: (event.status as string | null) ?? null,
      occurredAt: new Date(event.occurred_at as Date).toISOString(),
    })),
    ...events.rows.map((event) => ({
      type: String(event.event_type),
      description: (event.description as string | null) ?? null,
      status: null,
      occurredAt: new Date(event.occurred_at as Date).toISOString(),
    })),
  ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return {
    reference: String(row.reference),
    status: String(row.status),
    pickup: {
      formattedAddress: (row.origin_address as string | null) ?? null,
      contactName: (row.pickup_contact_name as string | null) ?? null,
    },
    destination: {
      formattedAddress: (row.destination_address as string | null) ?? null,
      contactName: (row.delivery_contact_name as string | null) ?? null,
    },
    routeStatus: (route.rows[0]?.status as string | null) ?? null,
    currentLocation,
    lastUpdatedAt: currentLocation?.lastUpdatedAt ?? null,
    estimatedArrivalAt: row.estimated_delivery_at
      ? new Date(row.estimated_delivery_at as Date).toISOString()
      : null,
    timeline,
  };
}

export async function getLiveDashboard(
  pool: Pool,
  actor: AuthContext,
  query: LiveQuery,
): Promise<LiveTrackingDashboardPayload> {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot access the live tracking dashboard');
  }
  const params: unknown[] = [];
  const where = ['1=1'];
  if (actor.orgType === 'OPERATOR' || query.organizationId) {
    const orgId = actor.orgType === 'OPERATOR' ? actor.orgId : query.organizationId;
    if (orgId) {
      params.push(orgId);
      where.push(`cl.organization_id = $${params.length}`);
    }
  }
  if (query.vehicleId) {
    params.push(query.vehicleId);
    where.push(`cl.vehicle_id = $${params.length}`);
  }
  if (query.driverId) {
    params.push(query.driverId);
    where.push(`cl.driver_id = $${params.length}`);
  }
  if (query.routeId) {
    params.push(query.routeId);
    where.push(`cl.route_id = $${params.length}`);
  }

  const locations = await pool.query(
    `
      SELECT ${latestLocationColumns('cl')}
      FROM vehicle_current_locations cl
      JOIN vehicles v ON v.id = cl.vehicle_id AND v.deleted_at IS NULL
      LEFT JOIN drivers d ON d.id = cl.driver_id
      LEFT JOIN routes r ON r.id = cl.route_id
      WHERE ${where.join(' AND ')}
      ORDER BY cl.last_updated_at DESC
      LIMIT 200
    `,
    params,
  );

  let vehicles = locations.rows.map((row) => mapVehicleLocation(row));
  if (query.freshness) {
    vehicles = vehicles.filter((item) => item.freshness === query.freshness);
  }

  const routeWhere = [
    `r.deleted_at IS NULL`,
    `r.status::text IN ('DISPATCHED', 'IN_TRANSIT', 'ARRIVED')`,
  ];
  const routeParams: unknown[] = [];
  applyOperatorFilter(actor, routeWhere, routeParams, 'r.organization_id');
  if (query.organizationId && actor.orgType === 'PLATFORM') {
    routeParams.push(query.organizationId);
    routeWhere.push(`r.organization_id = $${routeParams.length}`);
  }
  if (query.status) {
    routeParams.push(query.status);
    routeWhere.push(`r.status::text = $${routeParams.length}`);
  }
  const routes = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.vehicle_id,
             NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
             (SELECT count(*) FROM route_shipments rs WHERE rs.route_id = r.id) AS shipment_count,
             cl.last_updated_at
      FROM routes r
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN vehicle_current_locations cl ON cl.vehicle_id = r.vehicle_id
      WHERE ${routeWhere.join(' AND ')}
      ORDER BY r.updated_at DESC
      LIMIT 100
    `,
    routeParams,
  );

  const shipmentWhere = [
    's.deleted_at IS NULL',
    `s.status::text IN ('ASSIGNED', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'AT_DESTINATION', 'OUT_FOR_DELIVERY')`,
  ];
  const shipmentParams: unknown[] = [];
  applyOperatorFilter(actor, shipmentWhere, shipmentParams, 's.operator_organization_id');
  if (query.shipmentId) {
    shipmentParams.push(query.shipmentId);
    shipmentWhere.push(`s.id = $${shipmentParams.length}`);
  }
  const shipments = await pool.query(
    `
      SELECT s.id, s.reference, s.status::text AS status, c.name AS customer_name,
             r.reference AS route_reference
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      LEFT JOIN route_shipments rs ON rs.shipment_id = s.id
      LEFT JOIN routes r ON r.id = rs.route_id AND r.deleted_at IS NULL
        AND r.status::text NOT IN ('COMPLETED', 'CANCELLED')
      WHERE ${shipmentWhere.join(' AND ')}
      ORDER BY s.updated_at DESC
      LIMIT 100
    `,
    shipmentParams,
  );

  return {
    vehicles,
    activeRoutes: routes.rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      status: String(row.status),
      vehicleId: (row.vehicle_id as string | null) ?? null,
      driverName: (row.driver_name as string | null) ?? null,
      shipmentCount: Number(row.shipment_count ?? 0),
      freshness: trackingFreshness(row.last_updated_at as Date | null, trackingThresholds()),
    })),
    activeShipments: shipments.rows.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      status: String(row.status),
      customerName: String(row.customer_name),
      routeReference: (row.route_reference as string | null) ?? null,
    })),
    thresholds: trackingThresholds(),
    map: mapConfig(),
  };
}

export async function getMyTrackingAssignment(
  pool: Pool,
  actor: AuthContext,
): Promise<DriverTrackingAssignmentPayload> {
  const driver = await resolveActorDriver(pool, actor);
  if (!driver) {
    throw forbidden('No driver profile is linked to this account');
  }
  const route = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.origin_text, r.destination_text,
             r.vehicle_id, v.registration_number, v.reference AS vehicle_reference
      FROM routes r
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.driver_id = $1 AND r.deleted_at IS NULL
        AND r.status::text = ANY($2::text[])
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [driver.id, ACTIVE_ROUTE_STATUSES],
  );
  const assigned = route.rows[0] ?? null;
  const currentLocation = assigned?.vehicle_id
    ? await getLatestVehicleLocation(pool, actor, String(assigned.vehicle_id)).catch(() => null)
    : null;

  return {
    driverId: driver.id,
    driverName: driver.name,
    organizationId: driver.organizationId,
    status: driver.status,
    route: assigned
      ? {
          id: String(assigned.id),
          reference: String(assigned.reference),
          status: String(assigned.status),
          origin: (assigned.origin_text as string | null) ?? null,
          destination: (assigned.destination_text as string | null) ?? null,
        }
      : null,
    vehicle: assigned?.vehicle_id
      ? {
          id: String(assigned.vehicle_id),
          registration: (assigned.registration_number as string | null) ?? null,
          reference: (assigned.vehicle_reference as string | null) ?? null,
        }
      : null,
    currentLocation,
  };
}

export async function listTrackingEvents(pool: Pool, actor: AuthContext, query: EventsQuery) {
  const params: unknown[] = [];
  const where = ['1=1'];
  await applyTrackingVisibility(pool, actor, where, params, {
    orgColumn: 'e.organization_id',
    driverColumn: 'e.driver_id',
    routeColumn: 'e.route_id',
    shipmentColumn: 'e.shipment_id',
  });
  if (query.vehicleId) {
    params.push(query.vehicleId);
    where.push(`e.vehicle_id = $${params.length}`);
  }
  if (query.routeId) {
    params.push(query.routeId);
    where.push(`e.route_id = $${params.length}`);
  }
  if (query.shipmentId) {
    params.push(query.shipmentId);
    where.push(`e.shipment_id = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`e.occurred_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`e.occurred_at <= $${params.length}`);
  }
  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM tracking_events e WHERE ${where.join(' AND ')}`,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT e.id, e.event_type, e.organization_id, e.vehicle_id, e.driver_id, e.route_id,
             e.shipment_id, e.stop_id, e.latitude, e.longitude, e.description,
             e.actor_user_id, e.metadata, e.occurred_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
      FROM tracking_events e
      LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.occurred_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  return {
    events: result.rows.map(mapTrackingEvent),
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function issueShipmentTrackingToken(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
): Promise<ShipmentTrackingTokenPayload> {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage tracking tokens');
  }
  const shipment = await pool.query<{
    operator_organization_id: string;
    customer_organization_id: string;
    reference: string;
    customer_name: string;
  }>(
    `
      SELECT s.operator_organization_id, s.customer_organization_id, s.reference,
             c.name AS customer_name
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `,
    [shipmentId],
  );
  if (!shipment.rows[0]) {
    throw notFound('Shipment not found');
  }
  assertOperatorAccess(actor, shipment.rows[0].operator_organization_id);
  await pool.query(
    `UPDATE shipment_tracking_tokens SET revoked_at = now() WHERE shipment_id = $1 AND revoked_at IS NULL`,
    [shipmentId],
  );
  const raw = `mxt_${createOpaqueToken()}`;
  const hint = raw.slice(-4);
  await pool.query(
    `
      INSERT INTO shipment_tracking_tokens (
        shipment_id, organization_id, token_hash, token_hint, created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [shipmentId, shipment.rows[0].operator_organization_id, hashToken(raw), hint, actor.userId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: shipment.rows[0].operator_organization_id,
    action: 'TRACKING_TOKEN_ISSUED',
    entityType: 'shipment',
    entityId: shipmentId,
    after: { tokenHint: hint },
  });
  await emitNotification(pool, {
    type: 'TRACKING_STARTED',
    organizationId: shipment.rows[0].operator_organization_id,
    operatorOrganizationId: shipment.rows[0].operator_organization_id,
    customerOrganizationId: shipment.rows[0].customer_organization_id,
    relatedEntityType: 'shipment',
    relatedEntityId: shipmentId,
    relatedReference: shipment.rows[0].reference,
    actorUserId: actor.userId,
    variables: {
      shipment_reference: shipment.rows[0].reference,
      customer_name: shipment.rows[0].customer_name,
    },
  });
  return {
    shipmentId,
    token: raw,
    tokenHint: hint,
    createdAt: new Date().toISOString(),
    publicPath: `/track/${raw}`,
  };
}

export async function revokeShipmentTrackingToken(
  pool: Pool,
  actor: AuthContext,
  shipmentId: string,
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage tracking tokens');
  }
  const shipment = await pool.query<{ operator_organization_id: string }>(
    `SELECT operator_organization_id FROM shipments WHERE id = $1 AND deleted_at IS NULL`,
    [shipmentId],
  );
  if (!shipment.rows[0]) {
    throw notFound('Shipment not found');
  }
  assertOperatorAccess(actor, shipment.rows[0].operator_organization_id);
  await pool.query(
    `UPDATE shipment_tracking_tokens SET revoked_at = now() WHERE shipment_id = $1 AND revoked_at IS NULL`,
    [shipmentId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: shipment.rows[0].operator_organization_id,
    action: 'TRACKING_TOKEN_REVOKED',
    entityType: 'shipment',
    entityId: shipmentId,
  });
  return { shipmentId, revoked: true };
}

export async function ensureShipmentTrackingToken(
  client: PoolClient,
  shipmentId: string,
  organizationId: string,
  actorUserId: string | null,
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM shipment_tracking_tokens WHERE shipment_id = $1 AND revoked_at IS NULL LIMIT 1`,
    [shipmentId],
  );
  if (existing.rows[0]) {
    return;
  }
  const raw = `mxt_${createOpaqueToken()}`;
  await client.query(
    `
      INSERT INTO shipment_tracking_tokens (
        shipment_id, organization_id, token_hash, token_hint, created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [shipmentId, organizationId, hashToken(raw), raw.slice(-4), actorUserId],
  );
}

export async function recordOperationalTrackingEvent(
  pool: Pool | PoolClient,
  input: {
    organizationId: string;
    type: TrackingEventType;
    vehicleId?: string | null;
    driverId?: string | null;
    routeId?: string | null;
    shipmentId?: string | null;
    stopId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    description?: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await insertTrackingEvent(pool, input);
}

async function resolveAuthorizedAssignment(pool: Pool, actor: AuthContext, input: SubmitInput) {
  if (actor.role === 'DRIVER') {
    return resolveDriverAssignment(pool, actor, input);
  }
  if (!canManageOrOpsSubmit(actor)) {
    return resolveDriverAssignment(pool, actor, input);
  }
  if (!input.vehicleId) {
    throw unprocessable('vehicleId is required for operations location updates');
  }
  const vehicle = await pool.query<{
    organization_id: string;
    status: string;
    deleted_at: Date | null;
  }>(`SELECT organization_id, status::text AS status, deleted_at FROM vehicles WHERE id = $1`, [
    input.vehicleId,
  ]);
  const row = vehicle.rows[0];
  if (!row || row.deleted_at) {
    throw notFound('Vehicle not found');
  }
  assertOperatorAccess(actor, row.organization_id);
  const route = await activeRouteForVehicle(pool, input.vehicleId, input.routeId);
  return {
    organizationId: row.organization_id,
    vehicleId: input.vehicleId,
    driverId: route?.driver_id ?? null,
    routeId: route?.id ?? null,
    shipmentId: route?.shipment_id ?? null,
  };
}

async function resolveDriverAssignment(pool: Pool, actor: AuthContext, input: SubmitInput) {
  const driver = await pool.query<{
    id: string;
    organization_id: string;
    status: string;
    deleted_at: Date | null;
  }>(
    `
      SELECT id, organization_id, status::text AS status, deleted_at
      FROM drivers
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [actor.userId],
  );
  const row = driver.rows[0];
  if (!row) {
    throw forbidden('No driver profile is linked to this account');
  }
  if (INACTIVE_DRIVER_STATUSES.includes(row.status)) {
    throw unprocessable(`Driver is ${row.status.toLowerCase()} and cannot submit locations`);
  }
  if (actor.orgType === 'OPERATOR' && actor.orgId !== row.organization_id) {
    throw forbidden('Driver belongs to another organization');
  }
  const route = await pool.query<{
    id: string;
    vehicle_id: string;
    driver_id: string;
    shipment_id: string | null;
  }>(
    `
      SELECT r.id, r.vehicle_id, r.driver_id, rs.shipment_id
      FROM routes r
      LEFT JOIN route_shipments rs ON rs.route_id = r.id
      WHERE r.driver_id = $1 AND r.deleted_at IS NULL
        AND r.status::text = ANY($2::text[])
        AND r.vehicle_id IS NOT NULL
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [row.id, ACTIVE_ROUTE_STATUSES],
  );
  const assigned = route.rows[0];
  if (!assigned) {
    throw unprocessable('Driver is not assigned to an active dispatched route');
  }
  if (input.vehicleId && input.vehicleId !== assigned.vehicle_id) {
    throw forbidden('You are not authorized to submit locations for that vehicle');
  }
  if (input.routeId && input.routeId !== assigned.id) {
    throw forbidden('You are not authorized to submit locations for that route');
  }
  return {
    organizationId: row.organization_id,
    vehicleId: assigned.vehicle_id,
    driverId: assigned.driver_id,
    routeId: assigned.id,
    shipmentId: assigned.shipment_id,
  };
}

async function activeRouteForVehicle(pool: Pool, vehicleId: string, requestedRouteId?: string) {
  const result = await pool.query<{
    id: string;
    driver_id: string | null;
    shipment_id: string | null;
  }>(
    `
      SELECT r.id, r.driver_id, rs.shipment_id
      FROM routes r
      LEFT JOIN route_shipments rs ON rs.route_id = r.id
      WHERE r.vehicle_id = $1 AND r.deleted_at IS NULL
        AND r.status::text = ANY($2::text[])
        AND ($3::uuid IS NULL OR r.id = $3)
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [vehicleId, ACTIVE_ROUTE_STATUSES, requestedRouteId ?? null],
  );
  return result.rows[0] ?? null;
}

function canManageOrOpsSubmit(actor: AuthContext) {
  return actor.permissions.includes('tracking.manage');
}

export function trackingEventTypeForShipmentStatus(status: string): TrackingEventType | null {
  switch (status) {
    case 'PICKED_UP':
      return 'SHIPMENT_PICKED_UP';
    case 'IN_TRANSIT':
      return 'SHIPMENT_IN_TRANSIT';
    case 'AT_DESTINATION':
      return 'SHIPMENT_ARRIVED';
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return 'DELIVERY_COMPLETED';
    default:
      return null;
  }
}

function resolveDeviceTimestamp(value: string | undefined, futureSkew: number, maxAge: number) {
  const now = Date.now();
  if (!value) {
    return new Date(now);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw unprocessable('Device timestamp is invalid');
  }
  const delta = (parsed.getTime() - now) / 1000;
  if (delta > futureSkew) {
    throw unprocessable('Device timestamp cannot be in the future');
  }
  if (delta < -maxAge) {
    throw unprocessable('Device timestamp is too old');
  }
  return parsed;
}

async function shouldRecordLocationEvent(
  client: PoolClient,
  vehicleId: string,
  latitude: number,
  longitude: number,
) {
  const last = await client.query<{ latitude: string; longitude: string; occurred_at: Date }>(
    `
      SELECT latitude, longitude, occurred_at
      FROM tracking_events
      WHERE vehicle_id = $1 AND event_type = 'LOCATION_UPDATED'
      ORDER BY occurred_at DESC
      LIMIT 1
    `,
    [vehicleId],
  );
  const previous = last.rows[0];
  if (!previous) {
    return true;
  }
  const ageMs = Date.now() - new Date(previous.occurred_at).getTime();
  if (ageMs > 120_000) {
    return true;
  }
  return (
    haversineMeters(Number(previous.latitude), Number(previous.longitude), latitude, longitude) >=
    50
  );
}

export async function insertTrackingEvent(
  client: Pool | PoolClient,
  input: {
    organizationId: string;
    type: TrackingEventType;
    vehicleId?: string | null;
    driverId?: string | null;
    routeId?: string | null;
    shipmentId?: string | null;
    stopId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    description?: string;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      INSERT INTO tracking_events (
        organization_id, event_type, vehicle_id, driver_id, route_id, shipment_id,
        stop_id, latitude, longitude, description, actor_user_id, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      ON CONFLICT DO NOTHING
    `,
    [
      input.organizationId,
      input.type,
      input.vehicleId ?? null,
      input.driverId ?? null,
      input.routeId ?? null,
      input.shipmentId ?? null,
      input.stopId ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.description ?? null,
      input.actorUserId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

async function applyTrackingVisibility(
  pool: Pool,
  actor: AuthContext,
  where: string[],
  params: unknown[],
  columns: {
    orgColumn: string;
    driverColumn: string;
    routeColumn: string;
    shipmentColumn: string;
  },
) {
  if (actor.role === 'DRIVER') {
    const driver = await resolveActorDriver(pool, actor);
    if (!driver) {
      throw forbidden('No driver profile is linked to this account');
    }
    params.push(driver.id);
    where.push(`${columns.driverColumn} = $${params.length}`);
    return;
  }
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`${columns.orgColumn} = $${params.length}`);
    return;
  }
  params.push(actor.orgId);
  where.push(
    `EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.customer_organization_id = $${params.length}
        AND s.deleted_at IS NULL
        AND (
          s.id = ${columns.shipmentColumn}
          OR EXISTS (
            SELECT 1 FROM route_shipments rs
            WHERE rs.shipment_id = s.id
              AND rs.route_id = ${columns.routeColumn}
          )
        )
    )`,
  );
}

async function assertCanViewVehicleLocation(
  pool: Pool,
  actor: AuthContext,
  record: { organizationId: string; driverId: string | null; routeId: string | null },
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.role === 'DRIVER') {
    const driver = await resolveActorDriver(pool, actor);
    if (!driver || driver.id !== record.driverId) {
      throw forbidden('You do not have access to this tracking record');
    }
    return;
  }
  if (actor.orgType === 'OPERATOR' && actor.orgId === record.organizationId) {
    return;
  }
  if (actor.orgType === 'CUSTOMER' && record.routeId) {
    await assertCustomerOwnsRoute(pool, actor.orgId, record.routeId);
    return;
  }
  throw forbidden('You do not have access to this tracking record');
}

async function resolveActorDriver(pool: Pool, actor: AuthContext) {
  const result = await pool.query<{
    id: string;
    organization_id: string;
    status: string;
    first_name: string;
    last_name: string;
  }>(
    `
      SELECT id, organization_id, status::text AS status, first_name, last_name
      FROM drivers
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [actor.userId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    name: `${row.first_name} ${row.last_name}`.trim(),
  };
}

async function assertCustomerOwnsRoute(pool: Pool, customerOrgId: string, routeId: string) {
  const owned = await pool.query(
    `
      SELECT rs.id
      FROM route_shipments rs
      JOIN shipments s ON s.id = rs.shipment_id
      WHERE rs.route_id = $1 AND s.customer_organization_id = $2
      LIMIT 1
    `,
    [routeId, customerOrgId],
  );
  if (!owned.rows[0]) {
    throw forbidden('You do not have access to this route');
  }
}

async function assertVehicleReadable(pool: Pool, actor: AuthContext, vehicleId: string) {
  const result = await pool.query<{ organization_id: string; deleted_at: Date | null }>(
    `SELECT organization_id, deleted_at FROM vehicles WHERE id = $1`,
    [vehicleId],
  );
  if (!result.rows[0] || result.rows[0].deleted_at) {
    throw notFound('Vehicle not found');
  }
  assertOperatorAccess(actor, result.rows[0].organization_id);
}

function latestLocationSql() {
  return `
    SELECT ${latestLocationColumns('cl')}
    FROM vehicle_current_locations cl
    JOIN vehicles v ON v.id = cl.vehicle_id
    LEFT JOIN drivers d ON d.id = cl.driver_id
    LEFT JOIN routes r ON r.id = cl.route_id
    WHERE cl.vehicle_id = $1
    LIMIT 1
  `;
}

function latestLocationColumns(alias: string) {
  return `
    ${alias}.vehicle_id, ${alias}.organization_id, ${alias}.driver_id, ${alias}.route_id,
    ${alias}.latitude, ${alias}.longitude, ${alias}.accuracy_meters, ${alias}.speed_kph,
    ${alias}.heading_degrees, ${alias}.source, ${alias}.last_updated_at,
    v.reference AS vehicle_reference, v.registration_number,
    NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
    r.reference AS route_reference, r.status::text AS route_status
  `;
}

function mapVehicleLocation(row: Record<string, unknown>): VehicleLocationPayload {
  const lastUpdatedAt = new Date(row.last_updated_at as Date).toISOString();
  const thresholds = trackingThresholds();
  return {
    vehicleId: String(row.vehicle_id),
    organizationId: String(row.organization_id),
    vehicleReference: (row.vehicle_reference as string | null) ?? null,
    vehicleRegistration: (row.registration_number as string | null) ?? null,
    driverId: (row.driver_id as string | null) ?? null,
    driverName: (row.driver_name as string | null) ?? null,
    routeId: (row.route_id as string | null) ?? null,
    routeReference: (row.route_reference as string | null) ?? null,
    routeStatus: (row.route_status as string | null) ?? null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: toNumber(row.accuracy_meters),
    speedKph: toNumber(row.speed_kph),
    headingDegrees: toNumber(row.heading_degrees),
    lastUpdatedAt,
    ageSeconds: locationAgeSeconds(lastUpdatedAt) ?? 0,
    freshness: trackingFreshness(lastUpdatedAt, thresholds) as TrackingFreshness,
    source: row.source as LocationSource,
  };
}

function mapLocationRecord(row: Record<string, unknown>): LocationRecordPayload {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    vehicleId: String(row.vehicle_id),
    driverId: (row.driver_id as string | null) ?? null,
    routeId: (row.route_id as string | null) ?? null,
    shipmentId: (row.shipment_id as string | null) ?? null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracyMeters: toNumber(row.accuracy_meters),
    speedKph: toNumber(row.speed_kph),
    headingDegrees: toNumber(row.heading_degrees),
    altitudeMeters: toNumber(row.altitude_meters),
    batteryPercent: toNumber(row.battery_percent),
    source: row.source as LocationSource,
    deviceTimestamp: new Date(row.device_timestamp as Date).toISOString(),
    receivedAt: new Date(row.received_at as Date).toISOString(),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

function mapTrackingEvent(row: Record<string, unknown>): TrackingEventPayload {
  return {
    id: String(row.id),
    type: row.event_type as TrackingEventType,
    organizationId: String(row.organization_id),
    vehicleId: (row.vehicle_id as string | null) ?? null,
    driverId: (row.driver_id as string | null) ?? null,
    routeId: (row.route_id as string | null) ?? null,
    shipmentId: (row.shipment_id as string | null) ?? null,
    stopId: (row.stop_id as string | null) ?? null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: (row.description as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    occurredAt: new Date(row.occurred_at as Date).toISOString(),
  };
}

function toNumber(value: unknown) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(a));
}
