import type { ContactPayload, CustomerPayload } from '@mizigox/shared';
import type { Pool } from 'pg';
import { insertAddress, mapAddress } from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { z } from 'zod';
import type { createCustomerSchema, listCustomersQuerySchema } from './customer.schemas.js';

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export async function createCustomer(pool: Pool, actor: AuthContext, input: CreateCustomerInput) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot create other customer organizations');
  }

  const operatorId = await resolveOperatorId(pool, actor, input.operatorOrganizationId);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const org = await client.query<{ id: string }>(
      `
        INSERT INTO organizations (
          type, name, legal_name, country_code, default_currency_code,
          email, phone_e164, parent_organization_id
        )
        VALUES ('CUSTOMER', $1, $2, $3, 'RWF', $4, $5, $6)
        RETURNING id
      `,
      [
        input.name,
        input.legalName ?? null,
        input.countryCode,
        input.email ?? null,
        input.phoneE164 ?? null,
        operatorId,
      ],
    );
    const organizationId = org.rows[0]?.id;
    if (!organizationId) {
      throw new Error('Failed to create customer organization');
    }

    await client.query(
      `
        INSERT INTO customer_profiles (
          organization_id, preferred_operator_organization_id, credit_terms_days
        )
        VALUES ($1, $2, $3)
      `,
      [organizationId, operatorId, input.creditTermsDays ?? 30],
    );

    if (input.primaryContact) {
      await client.query(
        `
          INSERT INTO contacts (
            organization_id, first_name, last_name, email, phone_e164, job_title, is_primary
          )
          VALUES ($1, $2, $3, $4, $5, $6, true)
        `,
        [
          organizationId,
          input.primaryContact.firstName,
          input.primaryContact.lastName,
          input.primaryContact.email ?? null,
          input.primaryContact.phoneE164 ?? null,
          input.primaryContact.jobTitle ?? null,
        ],
      );
    }

    if (input.primaryAddress) {
      await insertAddress(client, organizationId, {
        ...input.primaryAddress,
        label: input.primaryAddress.label ?? 'Primary',
        isDefault: true,
      });
    }

    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: 'CUSTOMER_CREATED',
      entityType: 'organization',
      entityId: organizationId,
      after: { name: input.name, operatorId },
    });
    return loadCustomer(pool, organizationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listCustomers(pool: Pool, actor: AuthContext, query: ListCustomersQuery) {
  const params: unknown[] = [];
  const where = ["o.type = 'CUSTOMER'", 'o.deleted_at IS NULL'];

  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(
      `(o.parent_organization_id = $${params.length} OR p.preferred_operator_organization_id = $${params.length})`,
    );
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`o.id = $${params.length}`);
  }

  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(o.name) LIKE $${params.length} OR lower(coalesce(o.legal_name, '')) LIKE $${params.length})`,
    );
  }

  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );

  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT o.id
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE ${where.join(' AND ')}
      ORDER BY o.name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const customers = await Promise.all(result.rows.map((row) => loadCustomer(pool, row.id)));
  return {
    customers,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getCustomer(pool: Pool, actor: AuthContext, customerId: string) {
  assertCustomerAccess(actor, customerId);
  const customer = await loadCustomer(pool, customerId);
  if (actor.orgType === 'OPERATOR' && customer.parentOrganizationId !== actor.orgId) {
    if (customer.preferredOperatorOrganizationId !== actor.orgId) {
      throw notFound('Customer not found');
    }
  }
  return customer;
}

export async function addCustomerContact(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: {
    firstName: string;
    lastName: string;
    email?: string;
    phoneE164?: string;
    jobTitle?: string;
    isPrimary?: boolean;
  },
) {
  await getCustomer(pool, actor, customerId);
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO contacts (
        organization_id, first_name, last_name, email, phone_e164, job_title, is_primary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      customerId,
      input.firstName,
      input.lastName,
      input.email ?? null,
      input.phoneE164 ?? null,
      input.jobTitle ?? null,
      input.isPrimary ?? false,
    ],
  );
  return result.rows[0]?.id;
}

export async function addCustomerAddress(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: Parameters<typeof insertAddress>[2],
) {
  await getCustomer(pool, actor, customerId);
  const client = await pool.connect();
  try {
    return await insertAddress(client, customerId, input);
  } finally {
    client.release();
  }
}

export async function loadCustomer(pool: Pool, customerId: string): Promise<CustomerPayload> {
  const org = await pool.query<{
    id: string;
    name: string;
    legal_name: string | null;
    email: string | null;
    phone_e164: string | null;
    country_code: string;
    default_currency_code: string;
    status: string;
    parent_organization_id: string | null;
    preferred_operator_organization_id: string | null;
    credit_terms_days: number | null;
  }>(
    `
      SELECT o.id, o.name, o.legal_name, o.email, o.phone_e164, o.country_code,
             o.default_currency_code, o.status::text AS status, o.parent_organization_id,
             p.preferred_operator_organization_id, p.credit_terms_days
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE o.id = $1 AND o.type = 'CUSTOMER' AND o.deleted_at IS NULL
    `,
    [customerId],
  );
  const row = org.rows[0];
  if (!row) {
    throw notFound('Customer not found');
  }

  const contacts = await pool.query(
    `
      SELECT id, organization_id, first_name, last_name, email, phone_e164, job_title, is_primary
      FROM contacts
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY is_primary DESC, last_name, first_name
    `,
    [customerId],
  );
  const addresses = await pool.query(
    `
      SELECT id, organization_id, label, country_code, admin_area_1, admin_area_2,
             locality, sub_locality, street_line1, street_line2, postal_code,
             landmark, formatted_address
      FROM addresses
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at
    `,
    [customerId],
  );

  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    email: row.email,
    phoneE164: row.phone_e164,
    countryCode: row.country_code,
    defaultCurrencyCode: row.default_currency_code,
    status: row.status,
    parentOrganizationId: row.parent_organization_id,
    preferredOperatorOrganizationId: row.preferred_operator_organization_id,
    creditTermsDays: row.credit_terms_days ?? 30,
    contacts: contacts.rows.map(mapContact),
    addresses: addresses.rows.map(mapAddress),
  };
}

function mapContact(row: {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_e164: string | null;
  job_title: string | null;
  is_primary: boolean;
}): ContactPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phoneE164: row.phone_e164,
    jobTitle: row.job_title,
    isPrimary: row.is_primary,
  };
}

function assertCustomerAccess(actor: AuthContext, customerId: string) {
  if (actor.orgType === 'CUSTOMER' && actor.orgId !== customerId) {
    throw forbidden('You can only access your own organization');
  }
}

async function resolveOperatorId(pool: Pool, actor: AuthContext, requested?: string) {
  if (actor.orgType === 'OPERATOR') {
    return actor.orgId;
  }
  if (requested) {
    const found = await pool.query(
      `SELECT id FROM organizations WHERE id = $1 AND type = 'OPERATOR' AND deleted_at IS NULL`,
      [requested],
    );
    if (!found.rows[0]) {
      throw notFound('Operator organization not found');
    }
    return requested;
  }
  const fallback = await pool.query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'OPERATOR' AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1
    `,
  );
  const id = fallback.rows[0]?.id;
  if (!id) {
    throw notFound('No operator organization is configured');
  }
  return id;
}
