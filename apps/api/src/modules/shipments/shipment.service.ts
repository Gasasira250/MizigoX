import { canTransitionShipment, type ShipmentPayload, type ShipmentStatus } from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { insertAddress, mapAddress, toNumber, type AddressInput } from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError, forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { z } from 'zod';
import type {
  createShipmentSchema,
  listShipmentsQuerySchema,
  updateShipmentStatusSchema,
} from './shipment.schemas.js';

type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;
type StatusInput = z.infer<typeof updateShipmentStatusSchema>;

export async function createShipment(pool: Pool, actor: AuthContext, input: CreateShipmentInput) {
  const customerId = await resolveCustomerId(pool, actor, input.customerOrganizationId);
  const operatorId = await resolveOperatorForCustomer(pool, actor, customerId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const originId = await resolveAddress(client, customerId, input.origin);
    const destinationId = await resolveAddress(client, customerId, input.destination);
    const origin = await client.query<{ country_code: string }>(
      'SELECT country_code FROM addresses WHERE id = $1',
      [originId],
    );
    const destination = await client.query<{ country_code: string }>(
      'SELECT country_code FROM addresses WHERE id = $1',
      [destinationId],
    );
    const originCountry = origin.rows[0]?.country_code ?? 'RW';
    const destinationCountry = destination.rows[0]?.country_code ?? 'RW';
    const reference = await nextReference(client, originCountry);

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO shipments (
          reference, customer_organization_id, operator_organization_id, booked_by_user_id,
          status, cargo_description, cargo_type, weight_kg, pieces_count, special_instructions,
          origin_address_id, destination_address_id, origin_country_code, destination_country_code,
          estimated_pickup_at, estimated_delivery_at
        )
        VALUES (
          $1, $2, $3, $4, 'BOOKED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        RETURNING id
      `,
      [
        reference,
        customerId,
        operatorId,
        actor.userId,
        input.cargoDescription,
        input.cargoType ?? null,
        input.weightKg ?? null,
        input.piecesCount ?? null,
        input.specialInstructions ?? null,
        originId,
        destinationId,
        originCountry,
        destinationCountry,
        input.estimatedPickupAt ?? null,
        input.estimatedDeliveryAt ?? null,
      ],
    );
    const shipmentId = created.rows[0]?.id;
    if (!shipmentId) {
      throw new Error('Failed to create shipment');
    }

    for (const item of input.items ?? []) {
      await client.query(
        `
          INSERT INTO shipment_items (
            shipment_id, description, quantity, weight_kg, length_cm, width_cm, height_cm
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          shipmentId,
          item.description,
          item.quantity,
          item.weightKg ?? null,
          item.lengthCm ?? null,
          item.widthCm ?? null,
          item.heightCm ?? null,
        ],
      );
    }

    await insertEvent(client, {
      shipmentId,
      type: 'BOOKED',
      status: 'BOOKED',
      note: 'Shipment booked',
      actorUserId: actor.userId,
    });
    await client.query('COMMIT');

    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: customerId,
      action: 'SHIPMENT_CREATED',
      entityType: 'shipment',
      entityId: shipmentId,
      after: { reference, status: 'BOOKED' },
    });
    return loadShipment(pool, actor, shipmentId);
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
    where.push(`s.status = $${params.length}`);
  }
  if (query.customerId) {
    params.push(query.customerId);
    where.push(`s.customer_organization_id = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(s.reference) LIKE $${params.length} OR lower(c.name) LIKE $${params.length} OR lower(coalesce(s.cargo_description, '')) LIKE $${params.length})`,
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

  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT s.id
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.created_at DESC
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
        s.id, s.reference, s.status::text AS status,
        s.customer_organization_id, c.name AS customer_name,
        s.operator_organization_id, op.name AS operator_name,
        s.cargo_description, s.cargo_type, s.weight_kg, s.pieces_count,
        s.special_instructions, s.origin_country_code, s.destination_country_code,
        s.estimated_pickup_at, s.estimated_delivery_at, s.created_at,
        s.origin_address_id, s.destination_address_id
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      JOIN organizations op ON op.id = s.operator_organization_id
      WHERE s.id = $1 AND s.deleted_at IS NULL
    `,
    [shipmentId],
  );
  const row = result.rows[0] as
    | {
        id: string;
        reference: string;
        status: ShipmentStatus;
        customer_organization_id: string;
        customer_name: string;
        operator_organization_id: string;
        operator_name: string;
        cargo_description: string | null;
        cargo_type: string | null;
        weight_kg: string | null;
        pieces_count: number | null;
        special_instructions: string | null;
        origin_country_code: string;
        destination_country_code: string;
        estimated_pickup_at: Date | null;
        estimated_delivery_at: Date | null;
        created_at: Date;
        origin_address_id: string | null;
        destination_address_id: string | null;
      }
    | undefined;
  if (!row) {
    throw notFound('Shipment not found');
  }
  assertShipmentAccess(actor, row.customer_organization_id, row.operator_organization_id);

  const [origin, destination, items, events] = await Promise.all([
    loadAddress(pool, row.origin_address_id),
    loadAddress(pool, row.destination_address_id),
    pool.query(
      `
        SELECT id, description, quantity, weight_kg, length_cm, width_cm, height_cm
        FROM shipment_items WHERE shipment_id = $1 ORDER BY created_at
      `,
      [shipmentId],
    ),
    pool.query(
      `
        SELECT id, event_type, status::text AS status, note, actor_user_id, occurred_at
        FROM shipment_events WHERE shipment_id = $1 ORDER BY occurred_at ASC
      `,
      [shipmentId],
    ),
  ]);

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    customerOrganizationId: row.customer_organization_id,
    customerName: row.customer_name,
    operatorOrganizationId: row.operator_organization_id,
    operatorName: row.operator_name,
    cargoDescription: row.cargo_description,
    cargoType: row.cargo_type,
    weightKg: toNumber(row.weight_kg),
    piecesCount: row.pieces_count,
    specialInstructions: row.special_instructions,
    originCountryCode: row.origin_country_code,
    destinationCountryCode: row.destination_country_code,
    estimatedPickupAt: row.estimated_pickup_at?.toISOString() ?? null,
    estimatedDeliveryAt: row.estimated_delivery_at?.toISOString() ?? null,
    origin,
    destination,
    items: items.rows.map((item) => ({
      id: item.id as string,
      description: item.description as string,
      quantity: item.quantity as number,
      weightKg: toNumber(item.weight_kg as string | null),
      lengthCm: toNumber(item.length_cm as string | null),
      widthCm: toNumber(item.width_cm as string | null),
      heightCm: toNumber(item.height_cm as string | null),
    })),
    events: events.rows.map((event) => ({
      id: event.id as string,
      type: event.event_type as string,
      status: (event.status as ShipmentStatus | null) ?? null,
      note: (event.note as string | null) ?? null,
      actorUserId: (event.actor_user_id as string | null) ?? null,
      occurredAt: (event.occurred_at as Date).toISOString(),
    })),
    createdAt: row.created_at.toISOString(),
  };
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

  await pool.query('UPDATE shipments SET status = $2 WHERE id = $1', [shipmentId, input.status]);
  const client = await pool.connect();
  try {
    await insertEvent(client, {
      shipmentId,
      type: 'STATUS_CHANGED',
      status: input.status,
      note: input.note ?? `Status changed to ${input.status}`,
      actorUserId: actor.userId,
    });
  } finally {
    client.release();
  }

  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.operatorOrganizationId,
    action: 'SHIPMENT_STATUS_CHANGED',
    entityType: 'shipment',
    entityId: shipmentId,
    before: { status: current.status },
    after: { status: input.status },
  });
  return loadShipment(pool, actor, shipmentId);
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
  input: { addressId: string } | AddressInput,
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
  return insertAddress(client, organizationId, input);
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

async function insertEvent(
  client: PoolClient,
  input: {
    shipmentId: string;
    type: string;
    status: ShipmentStatus;
    note: string;
    actorUserId: string;
  },
) {
  await client.query(
    `
      INSERT INTO shipment_events (shipment_id, event_type, status, note, actor_user_id)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [input.shipmentId, input.type, input.status, input.note, input.actorUserId],
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
