import type { RoleCode } from '@mizigox/shared';
import { hashPassword } from '../src/lib/crypto.js';
import { getPool } from '../src/db/pool.js';

export async function createCustomerUser(input: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}) {
  const pool = getPool();
  const passwordHash = await hashPassword(input.password);

  const customerOrg = await pool.query<{ id: string }>(
    `
      INSERT INTO organizations (
        type, name, legal_name, country_code, default_currency_code, email
      )
      VALUES ('CUSTOMER', $1, $1, 'RW', 'RWF', $2)
      RETURNING id
    `,
    [`Customer ${input.email}`, input.email],
  );

  const organizationId = customerOrg.rows[0]?.id;
  if (!organizationId) {
    throw new Error('Failed to create customer organization');
  }

  const operator = await pool.query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'OPERATOR' AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1
    `,
  );
  await pool.query(
    `
      INSERT INTO customer_profiles (organization_id, preferred_operator_organization_id)
      VALUES ($1, $2)
      ON CONFLICT (organization_id) DO NOTHING
    `,
    [organizationId, operator.rows[0]?.id ?? null],
  );

  const user = await pool.query<{ id: string }>(
    `
      INSERT INTO users (
        email, password_hash, first_name, last_name, status, email_verified_at
      )
      VALUES (lower($1), $2, $3, $4, 'ACTIVE', now())
      RETURNING id
    `,
    [input.email, passwordHash, input.firstName ?? 'Customer', input.lastName ?? 'User'],
  );

  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error('Failed to create customer user');
  }

  await pool.query(
    `
      INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
      SELECT $1, $2, r.id, 'ACTIVE'
      FROM roles r
      WHERE r.code = 'CUSTOMER_USER'
    `,
    [organizationId, userId],
  );

  return { userId, organizationId };
}

export async function createOperatorOrganization(name: string) {
  const pool = getPool();
  const platform = await pool.query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'PLATFORM' AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1
    `,
  );
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO organizations (
        type, name, legal_name, country_code, default_currency_code, email, parent_organization_id
      )
      VALUES ('OPERATOR', $1, $1, 'RW', 'RWF', $2, $3)
      RETURNING id
    `,
    [name, `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`, platform.rows[0]?.id ?? null],
  );
  const id = created.rows[0]?.id;
  if (!id) {
    throw new Error('Failed to create operator organization');
  }
  return { id };
}

export async function createOrgUser(input: {
  email: string;
  password: string;
  role: RoleCode;
  organizationId: string;
  firstName?: string;
  lastName?: string;
}) {
  const pool = getPool();
  const passwordHash = await hashPassword(input.password);
  const user = await pool.query<{ id: string }>(
    `
      INSERT INTO users (
        email, password_hash, first_name, last_name, status, email_verified_at
      )
      VALUES (lower($1), $2, $3, $4, 'ACTIVE', now())
      RETURNING id
    `,
    [input.email, passwordHash, input.firstName ?? 'Staff', input.lastName ?? 'User'],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error('Failed to create organization user');
  }

  await pool.query(
    `
      INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
      SELECT $1, $2, r.id, 'ACTIVE'
      FROM roles r
      WHERE r.code = $3
    `,
    [input.organizationId, userId, input.role],
  );

  return { userId, organizationId: input.organizationId };
}
