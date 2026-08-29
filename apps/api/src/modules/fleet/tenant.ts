import { forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { Pool } from 'pg';

export function applyOperatorFilter(
  actor: AuthContext,
  where: string[],
  params: unknown[],
  column: string,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`${column} = $${params.length}`);
    return;
  }
  throw forbidden('You do not have access to fleet records');
}

export function assertOperatorAccess(actor: AuthContext, organizationId: string) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR' && actor.orgId === organizationId) {
    return;
  }
  throw forbidden('You do not have access to this record');
}

export async function resolveOperatorOrganizationId(
  pool: Pool,
  actor: AuthContext,
  requested?: string,
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage fleet records');
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
  const row = found.rows[0];
  if (!row || row.type !== 'OPERATOR') {
    throw notFound('Transporter organization not found');
  }
  return row.id;
}

export async function listOperatorOrganizations(pool: Pool, actor: AuthContext) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage fleet records');
  }

  const params: unknown[] = [];
  const where = [`type = 'OPERATOR'`, 'deleted_at IS NULL'];
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`id = $${params.length}`);
  }

  const result = await pool.query<{ id: string; name: string; country_code: string }>(
    `
      SELECT id, name, country_code
      FROM organizations
      WHERE ${where.join(' AND ')}
      ORDER BY name
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
  }));
}

export function normalizeRegistration(value: string) {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

export async function nextFleetReference(
  client: { query: Pool['query'] },
  table: 'vehicle_reference_counters' | 'driver_reference_counters',
  prefix: 'VEH' | 'DRV',
  countryCode: string,
) {
  const year = new Date().getUTCFullYear();
  const counter = await client.query<{ last_value: number }>(
    `
      INSERT INTO ${table} (country_code, year, last_value)
      VALUES ($1, $2, 1)
      ON CONFLICT (country_code, year)
      DO UPDATE SET last_value = ${table}.last_value + 1
      RETURNING last_value
    `,
    [countryCode, year],
  );
  return `${prefix}-${countryCode}-${year}-${String(counter.rows[0]?.last_value ?? 1).padStart(5, '0')}`;
}
