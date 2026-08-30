import type { GlobalSearchPayload, SearchHit, SearchResourceType } from '@mizigox/shared';
import { can } from '@mizigox/shared';
import type { Pool } from 'pg';
import { getLinkedDriver, likePattern } from '../../lib/linked-driver.js';
import type { AuthContext } from '../auth/auth.types.js';

const LIMIT = 8;

export async function globalSearch(
  pool: Pool,
  actor: AuthContext,
  input: { q: string; types: SearchResourceType[] },
): Promise<GlobalSearchPayload> {
  const query = input.q.trim();
  if (query.length < 2) {
    return { query, results: [] };
  }

  const pattern = likePattern(query);
  const results: SearchHit[] = [];
  const types = new Set(input.types);

  if (types.has('shipments') && can(actor.permissions, 'shipments.read')) {
    results.push(...(await searchShipments(pool, actor, pattern)));
  }
  if (types.has('customers') && can(actor.permissions, 'customers.read')) {
    results.push(...(await searchCustomers(pool, actor, pattern)));
  }
  if (types.has('routes') && (can(actor.permissions, 'routes.read') || actor.role === 'DRIVER')) {
    results.push(...(await searchRoutes(pool, actor, pattern)));
  }
  if (types.has('vehicles') && can(actor.permissions, 'vehicles.read')) {
    results.push(...(await searchVehicles(pool, actor, pattern)));
  }
  if (types.has('drivers') && can(actor.permissions, 'drivers.read')) {
    results.push(...(await searchDrivers(pool, actor, pattern)));
  }
  if (types.has('invoices') && can(actor.permissions, 'invoices.read')) {
    results.push(...(await searchInvoices(pool, actor, pattern)));
  }

  return { query, results };
}

function hrefFor(actor: AuthContext, type: SearchResourceType, id: string) {
  if (actor.role === 'DRIVER') {
    if (type === 'shipments') return `/driver/shipments/${id}`;
    if (type === 'routes') return `/driver/trips/${id}`;
    return `/driver`;
  }
  if (actor.orgType === 'CUSTOMER') {
    if (type === 'shipments') return `/portal/shipments/${id}`;
    if (type === 'invoices') return `/portal/invoices/${id}`;
    return `/portal`;
  }
  switch (type) {
    case 'shipments':
      return `/admin/shipments/${id}`;
    case 'customers':
      return `/admin/customers/${id}`;
    case 'routes':
      return `/admin/routes/${id}`;
    case 'vehicles':
      return `/admin/vehicles/${id}`;
    case 'drivers':
      return `/admin/drivers/${id}`;
    case 'invoices':
      return `/admin/invoices/${id}`;
    default:
      return '/admin';
  }
}

async function searchShipments(pool: Pool, actor: AuthContext, pattern: string) {
  const where = [
    's.deleted_at IS NULL',
    `(lower(s.reference) LIKE $1 ESCAPE '\\' OR lower(c.name) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`s.operator_organization_id = $${params.length}`);
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`s.customer_organization_id = $${params.length}`);
  }
  if (actor.role === 'DRIVER') {
    const driver = await getLinkedDriver(pool, actor, { required: true });
    params.push(driver!.id);
    where.push(`EXISTS (
      SELECT 1 FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = s.id AND r.driver_id = $${params.length} AND r.deleted_at IS NULL
    )`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT s.id, s.reference, s.status::text AS status, c.name AS customer_name
      FROM shipments s
      JOIN organizations c ON c.id = s.customer_organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'shipments' as const,
    id: String(row.id),
    title: String(row.reference),
    subtitle: `${row.customer_name} · ${row.status}`,
    href: hrefFor(actor, 'shipments', String(row.id)),
  }));
}

async function searchCustomers(pool: Pool, actor: AuthContext, pattern: string) {
  const where = [
    `o.type = 'CUSTOMER'`,
    'o.deleted_at IS NULL',
    `(lower(o.name) LIKE $1 ESCAPE '\\' OR lower(coalesce(p.customer_reference, '')) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(
      `(o.parent_organization_id = $${params.length} OR p.preferred_operator_organization_id = $${params.length})`,
    );
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`o.id = $${params.length}`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT o.id, o.name, o.status::text AS status
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE ${where.join(' AND ')}
      ORDER BY o.name
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'customers' as const,
    id: String(row.id),
    title: String(row.name),
    subtitle: String(row.status),
    href: hrefFor(actor, 'customers', String(row.id)),
  }));
}

async function searchRoutes(pool: Pool, actor: AuthContext, pattern: string) {
  const where = [
    'r.deleted_at IS NULL',
    `(lower(r.reference) LIKE $1 ESCAPE '\\' OR lower(coalesce(r.origin_text, '')) LIKE $1 ESCAPE '\\' OR lower(coalesce(r.destination_text, '')) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`r.organization_id = $${params.length}`);
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`EXISTS (
      SELECT 1 FROM route_shipments rs
      JOIN shipments s ON s.id = rs.shipment_id
      WHERE rs.route_id = r.id AND s.customer_organization_id = $${params.length}
    )`);
  }
  if (actor.role === 'DRIVER') {
    const driver = await getLinkedDriver(pool, actor, { required: true });
    params.push(driver!.id);
    where.push(`r.driver_id = $${params.length}`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT r.id, r.reference, r.status::text AS status, r.origin_text, r.destination_text
      FROM routes r
      WHERE ${where.join(' AND ')}
      ORDER BY r.updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'routes' as const,
    id: String(row.id),
    title: String(row.reference),
    subtitle: `${row.origin_text ?? 'Origin pending'} → ${row.destination_text ?? 'Destination pending'} · ${row.status}`,
    href: hrefFor(actor, 'routes', String(row.id)),
  }));
}

async function searchVehicles(pool: Pool, actor: AuthContext, pattern: string) {
  if (actor.orgType === 'CUSTOMER') {
    return [];
  }
  const where = [
    'v.deleted_at IS NULL',
    `(lower(v.reference) LIKE $1 ESCAPE '\\' OR lower(v.registration_number) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`v.organization_id = $${params.length}`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT v.id, v.reference, v.registration_number, v.status::text AS status
      FROM vehicles v
      WHERE ${where.join(' AND ')}
      ORDER BY v.registration_number
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'vehicles' as const,
    id: String(row.id),
    title: String(row.registration_number),
    subtitle: `${row.reference} · ${row.status}`,
    href: hrefFor(actor, 'vehicles', String(row.id)),
  }));
}

async function searchDrivers(pool: Pool, actor: AuthContext, pattern: string) {
  if (actor.orgType === 'CUSTOMER') {
    return [];
  }
  const where = [
    'd.deleted_at IS NULL',
    `(lower(d.reference) LIKE $1 ESCAPE '\\' OR lower(d.first_name) LIKE $1 ESCAPE '\\' OR lower(d.last_name) LIKE $1 ESCAPE '\\' OR lower(coalesce(d.phone_e164, '')) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`d.organization_id = $${params.length}`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT d.id, d.reference, d.first_name, d.last_name, d.status::text AS status
      FROM drivers d
      WHERE ${where.join(' AND ')}
      ORDER BY d.last_name, d.first_name
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'drivers' as const,
    id: String(row.id),
    title: `${row.first_name} ${row.last_name}`.trim(),
    subtitle: `${row.reference} · ${row.status}`,
    href: hrefFor(actor, 'drivers', String(row.id)),
  }));
}

async function searchInvoices(pool: Pool, actor: AuthContext, pattern: string) {
  const where = [
    'i.deleted_at IS NULL',
    `(lower(i.number) LIKE $1 ESCAPE '\\' OR lower(c.name) LIKE $1 ESCAPE '\\')`,
  ];
  const params: unknown[] = [pattern];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`i.organization_id = $${params.length}`);
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`i.customer_organization_id = $${params.length}`);
  }
  params.push(LIMIT);
  const result = await pool.query(
    `
      SELECT i.id, i.number, i.status::text AS status, c.name AS customer_name
      FROM invoices i
      JOIN organizations c ON c.id = i.customer_organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );
  return result.rows.map((row) => ({
    type: 'invoices' as const,
    id: String(row.id),
    title: String(row.number),
    subtitle: `${row.customer_name} · ${row.status}`,
    href: hrefFor(actor, 'invoices', String(row.id)),
  }));
}
