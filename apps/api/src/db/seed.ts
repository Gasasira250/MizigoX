import {
  COUNTRIES,
  CURRENCIES,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { getEnv } from '../config/env.js';
import { hashPassword } from '../lib/crypto.js';

export async function runSeed(pool: Pool) {
  const env = getEnv();

  for (const currency of CURRENCIES) {
    await pool.query(
      `
        INSERT INTO currencies (code, name, decimal_places, symbol, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            decimal_places = EXCLUDED.decimal_places,
            symbol = EXCLUDED.symbol,
            is_active = EXCLUDED.is_active,
            updated_at = now()
      `,
      [currency.code, currency.name, currency.decimalPlaces, currency.symbol, currency.isActive],
    );
  }

  for (const country of COUNTRIES) {
    await pool.query(
      `
        INSERT INTO countries (
          code, iso3, name, phone_country_code, default_timezone,
          default_currency_code, address_schema, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (code) DO UPDATE
        SET iso3 = EXCLUDED.iso3,
            name = EXCLUDED.name,
            phone_country_code = EXCLUDED.phone_country_code,
            default_timezone = EXCLUDED.default_timezone,
            default_currency_code = EXCLUDED.default_currency_code,
            address_schema = EXCLUDED.address_schema,
            is_active = EXCLUDED.is_active,
            updated_at = now()
      `,
      [
        country.code,
        country.iso3,
        country.name,
        country.phoneCountryCode,
        country.defaultTimezone,
        country.defaultCurrencyCode,
        JSON.stringify(country.addressSchema),
        country.isActive,
      ],
    );
  }

  for (const code of PERMISSIONS) {
    const [resource, action] = code.split('.');
    await pool.query(
      `
        INSERT INTO permissions (code, resource, action, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (code) DO UPDATE
        SET resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            description = EXCLUDED.description
      `,
      [code, resource, action, code.replace('.', ' ')],
    );
  }

  for (const code of ROLE_CODES) {
    const definition = ROLE_DEFINITIONS[code];
    await pool.query(
      `
        INSERT INTO roles (code, name, description, scope, is_system)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            scope = EXCLUDED.scope
      `,
      [code, definition.name, definition.description, definition.scope],
    );
  }

  await pool.query('DELETE FROM role_permissions');
  for (const roleCode of ROLE_CODES) {
    for (const permissionCode of ROLE_PERMISSIONS[roleCode]) {
      await pool.query(
        `
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT r.id, p.id
          FROM roles r
          CROSS JOIN permissions p
          WHERE r.code = $1 AND p.code = $2
          ON CONFLICT DO NOTHING
        `,
        [roleCode, permissionCode],
      );
    }
  }

  const platform = await upsertOrganization(pool, {
    type: 'PLATFORM',
    name: 'MizigoX',
    legalName: 'MizigoX Platform',
    countryCode: 'RW',
    currencyCode: 'RWF',
    email: 'platform@mizigox.local',
  });

  await upsertOrganization(pool, {
    type: 'OPERATOR',
    name: 'MizigoX Rwanda',
    legalName: 'MizigoX Rwanda Ltd',
    countryCode: 'RW',
    currencyCode: 'RWF',
    email: 'rwanda@mizigox.local',
    parentOrganizationId: platform.id,
  });

  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);
  const existingAdmin = await pool.query<{ id: string }>(
    `
      SELECT id FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
      LIMIT 1
    `,
    [env.SEED_ADMIN_EMAIL],
  );

  let adminId = existingAdmin.rows[0]?.id;
  if (!adminId) {
    const created = await pool.query<{ id: string }>(
      `
        INSERT INTO users (
          email, password_hash, first_name, last_name, status, email_verified_at
        )
        VALUES (lower($1), $2, $3, $4, 'ACTIVE', now())
        RETURNING id
      `,
      [env.SEED_ADMIN_EMAIL, passwordHash, env.SEED_ADMIN_FIRST_NAME, env.SEED_ADMIN_LAST_NAME],
    );
    adminId = created.rows[0]?.id;
  } else {
    await pool.query(
      `
        UPDATE users
        SET first_name = $2, last_name = $3, updated_at = now()
        WHERE id = $1
      `,
      [adminId, env.SEED_ADMIN_FIRST_NAME, env.SEED_ADMIN_LAST_NAME],
    );
  }

  if (!adminId) {
    throw new Error('Failed to seed Super Admin user');
  }

  await pool.query(
    `
      INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
      SELECT $1, $2, r.id, 'ACTIVE'
      FROM roles r
      WHERE r.code = 'SUPER_ADMIN'
      ON CONFLICT (organization_id, user_id) DO UPDATE
      SET role_id = EXCLUDED.role_id,
          status = 'ACTIVE',
          updated_at = now()
    `,
    [platform.id, adminId],
  );
}

async function upsertOrganization(
  pool: Pool,
  input: {
    type: 'PLATFORM' | 'OPERATOR' | 'CUSTOMER';
    name: string;
    legalName: string;
    countryCode: string;
    currencyCode: string;
    email: string;
    parentOrganizationId?: string;
  },
) {
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = $1 AND name = $2 AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.type, input.name],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await pool.query<{ id: string }>(
    `
      INSERT INTO organizations (
        type, name, legal_name, country_code, default_currency_code, email, parent_organization_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      input.type,
      input.name,
      input.legalName,
      input.countryCode,
      input.currencyCode,
      input.email,
      input.parentOrganizationId ?? null,
    ],
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new Error(`Failed to seed organization ${input.name}`);
  }
  return row;
}
