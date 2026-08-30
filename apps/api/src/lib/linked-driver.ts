import type { Pool } from 'pg';
import { forbidden } from './errors.js';
import type { AuthContext } from '../modules/auth/auth.types.js';

export interface LinkedDriver {
  id: string;
  organizationId: string;
  status: string;
  firstName: string;
  lastName: string;
  name: string;
}

export async function getLinkedDriver(
  pool: Pool,
  actor: AuthContext,
  options: { required?: boolean } = {},
): Promise<LinkedDriver | null> {
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
      ORDER BY created_at
      LIMIT 1
    `,
    [actor.userId],
  );
  const row = result.rows[0];
  if (!row) {
    if (actor.role === 'DRIVER' || options.required) {
      throw forbidden('No driver profile is linked to this account');
    }
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
  };
}

export function likePattern(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').toLowerCase()}%`;
}
