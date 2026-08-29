import type {
  ContactPayload,
  ContactStatus,
  CustomerLifecycleStatus,
  CustomerPayload,
} from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import {
  formatAddress,
  insertAddress,
  mapAddress,
  type AddressInput,
} from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { z } from 'zod';
import type {
  contactInputSchema,
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.schemas.js';

type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
type ContactInput = z.infer<typeof contactInputSchema>;

const SORT_COLUMNS = {
  name: 'o.name',
  createdAt: 'o.created_at',
  customerReference: 'p.customer_reference',
  status: 'o.status',
  city: 'p.city',
} as const;

export async function createCustomer(pool: Pool, actor: AuthContext, input: CreateCustomerInput) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot create other customer organizations');
  }

  const operatorId = await resolveOperatorId(pool, actor, input.operatorOrganizationId);
  await assertUniqueCustomer(pool, {
    name: input.name,
    taxId: input.taxId,
    countryCode: input.countryCode,
    parentOrganizationId: operatorId,
  });

  const currency = await defaultCurrencyFor(pool, input.countryCode);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const org = await client.query<{ id: string }>(
      `
        INSERT INTO organizations (
          type, name, legal_name, registration_number, tax_id, country_code,
          default_currency_code, email, phone_e164, parent_organization_id
        )
        VALUES ('CUSTOMER', $1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
      [
        input.name,
        input.legalName ?? null,
        input.registrationNumber ?? null,
        input.taxId ?? null,
        input.countryCode,
        currency,
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
          organization_id, preferred_operator_organization_id, credit_terms_days,
          customer_type, website, city, notes, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        organizationId,
        operatorId,
        input.creditTermsDays ?? 30,
        input.customerType,
        input.website ?? null,
        input.city ?? input.primaryAddress?.locality ?? input.primaryAddress?.adminArea2 ?? null,
        input.notes ?? null,
        actor.userId,
      ],
    );

    if (input.primaryContact) {
      await insertContact(client, organizationId, {
        ...input.primaryContact,
        isPrimary: true,
      });
    }

    if (input.primaryAddress) {
      await insertAddress(client, organizationId, {
        ...input.primaryAddress,
        label: input.primaryAddress.label ?? 'Primary',
        addressType: input.primaryAddress.addressType ?? 'OFFICE',
        isDefault: true,
      });
    }

    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: 'CUSTOMER_CREATED',
      entityType: 'customer',
      entityId: organizationId,
      after: {
        name: input.name,
        customerType: input.customerType,
        countryCode: input.countryCode,
        operatorId,
      },
    });
    return loadCustomer(pool, organizationId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw mapUniqueViolation(error);
  } finally {
    client.release();
  }
}

export async function listCustomers(pool: Pool, actor: AuthContext, query: ListCustomersQuery) {
  const params: unknown[] = [];
  const where = ["o.type = 'CUSTOMER'", 'o.deleted_at IS NULL'];
  applyTenantFilter(actor, where, params);

  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(`(
      lower(o.name) LIKE $${params.length}
      OR lower(coalesce(o.legal_name, '')) LIKE $${params.length}
      OR lower(coalesce(p.customer_reference, '')) LIKE $${params.length}
      OR lower(coalesce(o.email, '')) LIKE $${params.length}
      OR lower(coalesce(o.phone_e164, '')) LIKE $${params.length}
      OR lower(coalesce(p.city, '')) LIKE $${params.length}
      OR lower(coalesce(o.tax_id, '')) LIKE $${params.length}
    )`);
  }

  if (query.status === 'ACTIVE') {
    where.push(`o.status = 'ACTIVE'`);
  } else if (query.status === 'INACTIVE') {
    where.push(`o.status <> 'ACTIVE'`);
  }

  if (query.countryCode) {
    params.push(query.countryCode);
    where.push(`o.country_code = $${params.length}`);
  }

  if (query.customerType) {
    params.push(query.customerType);
    where.push(`p.customer_type = $${params.length}`);
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

  const sortColumn = SORT_COLUMNS[query.sort];
  const sortDirection = query.order === 'desc' ? 'DESC' : 'ASC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT o.id
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, o.name ASC
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
  const customer = await loadCustomer(pool, customerId);
  assertCanViewCustomer(actor, customer);
  return customer;
}

export async function updateCustomer(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const current = await getCustomer(pool, actor, customerId);
  const nextName = input.name ?? current.name;
  const nextTaxId = input.taxId === undefined ? current.taxId : input.taxId;
  const nextCountry = input.countryCode ?? current.countryCode;

  await assertUniqueCustomer(pool, {
    name: nextName,
    taxId: nextTaxId,
    countryCode: nextCountry,
    parentOrganizationId: current.parentOrganizationId,
    excludeId: customerId,
  });

  const currency =
    input.countryCode && input.countryCode !== current.countryCode
      ? await defaultCurrencyFor(pool, input.countryCode)
      : current.defaultCurrencyCode;

  const nextStatus =
    input.status === undefined ? undefined : input.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED';

  try {
    await pool.query(
      `
        UPDATE organizations
        SET name = COALESCE($2, name),
            legal_name = CASE WHEN $3::boolean THEN $4 ELSE legal_name END,
            registration_number = CASE WHEN $5::boolean THEN $6 ELSE registration_number END,
            tax_id = CASE WHEN $7::boolean THEN $8 ELSE tax_id END,
            email = CASE WHEN $9::boolean THEN $10 ELSE email END,
            phone_e164 = CASE WHEN $11::boolean THEN $12 ELSE phone_e164 END,
            country_code = COALESCE($13, country_code),
            default_currency_code = $14,
            status = COALESCE($15::organization_status, status),
            updated_at = now()
        WHERE id = $1
      `,
      [
        customerId,
        input.name ?? null,
        input.legalName !== undefined,
        input.legalName ?? null,
        input.registrationNumber !== undefined,
        input.registrationNumber ?? null,
        input.taxId !== undefined,
        input.taxId ?? null,
        input.email !== undefined,
        input.email ?? null,
        input.phoneE164 !== undefined,
        input.phoneE164 ?? null,
        input.countryCode ?? null,
        currency,
        nextStatus ?? null,
      ],
    );

    await pool.query(
      `
        UPDATE customer_profiles
        SET customer_type = COALESCE($2::customer_type, customer_type),
            website = CASE WHEN $3::boolean THEN $4 ELSE website END,
            city = CASE WHEN $5::boolean THEN $6 ELSE city END,
            notes = CASE WHEN $7::boolean THEN $8 ELSE notes END,
            credit_terms_days = COALESCE($9, credit_terms_days),
            updated_at = now()
        WHERE organization_id = $1
      `,
      [
        customerId,
        input.customerType ?? null,
        input.website !== undefined,
        input.website ?? null,
        input.city !== undefined,
        input.city ?? null,
        input.notes !== undefined,
        input.notes ?? null,
        input.creditTermsDays ?? null,
      ],
    );
  } catch (error) {
    throw mapUniqueViolation(error);
  }

  const updated = await loadCustomer(pool, customerId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action:
      input.status && input.status !== current.status
        ? statusAuditAction(input.status)
        : 'CUSTOMER_UPDATED',
    entityType: 'customer',
    entityId: customerId,
    before: summaryForAudit(current),
    after: summaryForAudit(updated),
  });
  return updated;
}

export async function setCustomerActive(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  active: boolean,
) {
  return updateCustomer(pool, actor, customerId, { status: active ? 'ACTIVE' : 'INACTIVE' });
}

export async function archiveCustomer(pool: Pool, actor: AuthContext, customerId: string) {
  const current = await getCustomer(pool, actor, customerId);
  await pool.query(
    `
      UPDATE organizations
      SET deleted_at = now(), status = 'SUSPENDED', updated_at = now()
      WHERE id = $1
    `,
    [customerId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action: 'CUSTOMER_ARCHIVED',
    entityType: 'customer',
    entityId: customerId,
    before: summaryForAudit(current),
    after: { archived: true },
  });
  return { id: customerId, archived: true };
}

export async function addCustomerContact(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: ContactInput,
) {
  await getCustomer(pool, actor, customerId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = await insertContact(client, customerId, input);
    await client.query('COMMIT');
    const contact = await loadContact(pool, customerId, id);
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: customerId,
      action: 'CUSTOMER_CONTACT_ADDED',
      entityType: 'contact',
      entityId: id,
      after: contact,
    });
    return contact;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCustomerContact(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  contactId: string,
  input: Partial<ContactInput>,
) {
  await getCustomer(pool, actor, customerId);
  const current = await loadContact(pool, customerId, contactId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.isPrimary) {
      await client.query(
        `
          UPDATE contacts
          SET is_primary = false
          WHERE organization_id = $1 AND deleted_at IS NULL AND is_primary = true AND id <> $2
        `,
        [customerId, contactId],
      );
    }
    await client.query(
      `
        UPDATE contacts
        SET first_name = COALESCE($3, first_name),
            last_name = COALESCE($4, last_name),
            email = CASE WHEN $5::boolean THEN $6 ELSE email END,
            phone_e164 = CASE WHEN $7::boolean THEN $8 ELSE phone_e164 END,
            job_title = CASE WHEN $9::boolean THEN $10 ELSE job_title END,
            is_primary = COALESCE($11, is_primary),
            status = COALESCE($12::contact_status, status),
            updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      `,
      [
        contactId,
        customerId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.email !== undefined,
        input.email ?? null,
        input.phoneE164 !== undefined,
        input.phoneE164 ?? null,
        input.jobTitle !== undefined,
        input.jobTitle ?? null,
        input.isPrimary ?? null,
        input.status ?? null,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const contact = await loadContact(pool, customerId, contactId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action: 'CUSTOMER_CONTACT_UPDATED',
    entityType: 'contact',
    entityId: contactId,
    before: current,
    after: contact,
  });
  return contact;
}

export async function removeCustomerContact(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  contactId: string,
) {
  await getCustomer(pool, actor, customerId);
  const current = await loadContact(pool, customerId, contactId);
  await pool.query(
    `
      UPDATE contacts
      SET deleted_at = now(), is_primary = false, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `,
    [contactId, customerId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action: 'CUSTOMER_CONTACT_REMOVED',
    entityType: 'contact',
    entityId: contactId,
    before: current,
  });
  return { id: contactId, archived: true };
}

export async function addCustomerAddress(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: AddressInput,
) {
  await getCustomer(pool, actor, customerId);
  const client = await pool.connect();
  try {
    const id = await insertAddress(client, customerId, input);
    const address = await loadAddressRecord(pool, customerId, id);
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: customerId,
      action: 'CUSTOMER_ADDRESS_ADDED',
      entityType: 'address',
      entityId: id,
      after: address,
    });
    return address;
  } finally {
    client.release();
  }
}

export async function updateCustomerAddress(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  addressId: string,
  input: Partial<AddressInput>,
) {
  await getCustomer(pool, actor, customerId);
  const current = await loadAddressRecord(pool, customerId, addressId);
  const next = {
    label: input.label ?? current.label ?? undefined,
    addressType: input.addressType ?? (current.addressType as AddressInput['addressType']),
    countryCode: input.countryCode ?? current.countryCode,
    adminArea1: input.adminArea1 ?? current.adminArea1 ?? undefined,
    adminArea2: input.adminArea2 ?? current.adminArea2 ?? undefined,
    locality: input.locality ?? current.locality ?? undefined,
    subLocality: input.subLocality ?? current.subLocality ?? undefined,
    streetLine1: input.streetLine1 ?? current.streetLine1 ?? undefined,
    streetLine2: input.streetLine2 ?? current.streetLine2 ?? undefined,
    postalCode: input.postalCode ?? current.postalCode ?? undefined,
    landmark: input.landmark ?? current.landmark ?? undefined,
    latitude: input.latitude ?? current.latitude ?? undefined,
    longitude: input.longitude ?? current.longitude ?? undefined,
    isDefault: input.isDefault ?? current.isDefault,
  };
  const formatted = formatAddress(next) || next.countryCode;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (next.isDefault) {
      await client.query(
        `
          UPDATE addresses
          SET is_default = false
          WHERE organization_id = $1 AND deleted_at IS NULL AND is_default = true AND id <> $2
        `,
        [customerId, addressId],
      );
    }
    const updated = await client.query(
      `
        UPDATE addresses
        SET label = $3,
            address_type = $4,
            country_code = $5,
            admin_area_1 = $6,
            admin_area_2 = $7,
            locality = $8,
            sub_locality = $9,
            street_line1 = $10,
            street_line2 = $11,
            postal_code = $12,
            landmark = $13,
            formatted_address = $14,
            latitude = $15,
            longitude = $16,
            is_default = $17,
            updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      `,
      [
        addressId,
        customerId,
        next.label ?? null,
        next.addressType ?? 'OTHER',
        next.countryCode,
        next.adminArea1 ?? null,
        next.adminArea2 ?? null,
        next.locality ?? null,
        next.subLocality ?? null,
        next.streetLine1 ?? null,
        next.streetLine2 ?? null,
        next.postalCode ?? null,
        next.landmark ?? null,
        formatted,
        next.latitude ?? null,
        next.longitude ?? null,
        next.isDefault ?? false,
      ],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw notFound('Address not found');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const address = await loadAddressRecord(pool, customerId, addressId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action: 'CUSTOMER_ADDRESS_UPDATED',
    entityType: 'address',
    entityId: addressId,
    before: current,
    after: address,
  });
  return address;
}

export async function removeCustomerAddress(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  addressId: string,
) {
  await getCustomer(pool, actor, customerId);
  const current = await loadAddressRecord(pool, customerId, addressId);
  await pool.query(
    `
      UPDATE addresses
      SET deleted_at = now(), is_default = false, updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `,
    [addressId, customerId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: customerId,
    action: 'CUSTOMER_ADDRESS_REMOVED',
    entityType: 'address',
    entityId: addressId,
    before: current,
  });
  return { id: addressId, archived: true };
}

export async function loadCustomer(pool: Pool, customerId: string): Promise<CustomerPayload> {
  const org = await pool.query<{
    id: string;
    name: string;
    legal_name: string | null;
    registration_number: string | null;
    tax_id: string | null;
    email: string | null;
    phone_e164: string | null;
    country_code: string;
    default_currency_code: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    parent_organization_id: string | null;
    customer_reference: string | null;
    customer_type: string | null;
    website: string | null;
    city: string | null;
    notes: string | null;
    created_by_user_id: string | null;
    created_by_name: string | null;
    preferred_operator_organization_id: string | null;
    credit_terms_days: number | null;
  }>(
    `
      SELECT o.id, o.name, o.legal_name, o.registration_number, o.tax_id, o.email, o.phone_e164,
             o.country_code, o.default_currency_code, o.status::text AS status,
             o.created_at, o.updated_at, o.parent_organization_id,
             p.customer_reference, p.customer_type::text AS customer_type, p.website, p.city,
             p.notes, p.created_by_user_id, p.preferred_operator_organization_id, p.credit_terms_days,
             NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS created_by_name
      FROM organizations o
      LEFT JOIN customer_profiles p ON p.organization_id = o.id
      LEFT JOIN users creator ON creator.id = p.created_by_user_id
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
      SELECT id, organization_id, first_name, last_name, email, phone_e164, job_title,
             is_primary, status::text AS status
      FROM contacts
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY is_primary DESC, last_name, first_name
    `,
    [customerId],
  );
  const addresses = await pool.query(
    `
      SELECT id, organization_id, label, address_type::text AS address_type, country_code,
             admin_area_1, admin_area_2, locality, sub_locality, street_line1, street_line2,
             postal_code, landmark, formatted_address, latitude, longitude, is_default
      FROM addresses
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at
    `,
    [customerId],
  );

  const mappedContacts = contacts.rows.map(mapContact);
  const primary = mappedContacts.find((contact) => contact.isPrimary) ?? mappedContacts[0];

  return {
    id: row.id,
    customerReference: row.customer_reference ?? '',
    name: row.name,
    legalName: row.legal_name,
    customerType: row.customer_type ?? 'BUSINESS',
    registrationNumber: row.registration_number,
    taxId: row.tax_id,
    email: row.email,
    phoneE164: row.phone_e164,
    website: row.website,
    countryCode: row.country_code,
    city: row.city,
    defaultCurrencyCode: row.default_currency_code,
    status: toLifecycleStatus(row.status),
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    parentOrganizationId: row.parent_organization_id,
    preferredOperatorOrganizationId: row.preferred_operator_organization_id,
    creditTermsDays: row.credit_terms_days ?? 30,
    primaryContactName: primary ? `${primary.firstName} ${primary.lastName}`.trim() : null,
    contacts: mappedContacts,
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
  status?: string | null;
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
    status: (row.status as ContactStatus) ?? 'ACTIVE',
  };
}

function applyTenantFilter(actor: AuthContext, where: string[], params: unknown[]) {
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(
      `(o.parent_organization_id = $${params.length} OR p.preferred_operator_organization_id = $${params.length})`,
    );
  } else if (actor.orgType === 'CUSTOMER') {
    params.push(actor.orgId);
    where.push(`o.id = $${params.length}`);
  }
}

function assertCanViewCustomer(actor: AuthContext, customer: CustomerPayload) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'CUSTOMER') {
    if (actor.orgId !== customer.id) {
      throw notFound('Customer not found');
    }
    return;
  }
  if (
    customer.parentOrganizationId !== actor.orgId &&
    customer.preferredOperatorOrganizationId !== actor.orgId
  ) {
    throw notFound('Customer not found');
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

async function defaultCurrencyFor(pool: Pool, countryCode: string) {
  const result = await pool.query<{ default_currency_code: string }>(
    'SELECT default_currency_code FROM countries WHERE code = $1',
    [countryCode],
  );
  return result.rows[0]?.default_currency_code ?? 'RWF';
}

async function assertUniqueCustomer(
  pool: Pool,
  input: {
    name: string;
    taxId?: string | null;
    countryCode: string;
    parentOrganizationId: string | null;
    excludeId?: string;
  },
) {
  const nameMatch = await pool.query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'CUSTOMER'
        AND deleted_at IS NULL
        AND parent_organization_id IS NOT DISTINCT FROM $1
        AND lower(name) = lower($2)
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1
    `,
    [input.parentOrganizationId, input.name, input.excludeId ?? null],
  );
  if (nameMatch.rows[0]) {
    throw conflict('A customer with this business name already exists for this operator');
  }

  const taxId = input.taxId?.trim();
  if (taxId) {
    const taxMatch = await pool.query<{ id: string }>(
      `
        SELECT id FROM organizations
        WHERE type = 'CUSTOMER'
          AND deleted_at IS NULL
          AND country_code = $1
          AND lower(tax_id) = lower($2)
          AND ($3::uuid IS NULL OR id <> $3)
        LIMIT 1
      `,
      [input.countryCode, taxId, input.excludeId ?? null],
    );
    if (taxMatch.rows[0]) {
      throw conflict(
        'A customer with this tax identification number already exists in this country',
      );
    }
  }
}

async function insertContact(client: PoolClient, organizationId: string, input: ContactInput) {
  if (input.isPrimary !== false) {
    const existingPrimary = await client.query(
      `
        SELECT 1 FROM contacts
        WHERE organization_id = $1 AND deleted_at IS NULL AND is_primary = true
        LIMIT 1
      `,
      [organizationId],
    );
    if (input.isPrimary || (existingPrimary.rowCount ?? 0) === 0) {
      await client.query(
        `
          UPDATE contacts
          SET is_primary = false
          WHERE organization_id = $1 AND deleted_at IS NULL AND is_primary = true
        `,
        [organizationId],
      );
    }
  }

  const isPrimary =
    input.isPrimary ??
    (
      await client.query(
        `SELECT 1 FROM contacts WHERE organization_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [organizationId],
      )
    ).rowCount === 0;

  const result = await client.query<{ id: string }>(
    `
      INSERT INTO contacts (
        organization_id, first_name, last_name, email, phone_e164, job_title, is_primary, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      organizationId,
      input.firstName,
      input.lastName,
      input.email ?? null,
      input.phoneE164 ?? null,
      input.jobTitle ?? null,
      isPrimary,
      input.status ?? 'ACTIVE',
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('Failed to create contact');
  }
  return id;
}

async function loadContact(pool: Pool, customerId: string, contactId: string) {
  const result = await pool.query(
    `
      SELECT id, organization_id, first_name, last_name, email, phone_e164, job_title,
             is_primary, status::text AS status
      FROM contacts
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `,
    [contactId, customerId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Contact not found');
  }
  return mapContact(row);
}

async function loadAddressRecord(pool: Pool, customerId: string, addressId: string) {
  const result = await pool.query(
    `
      SELECT id, organization_id, label, address_type::text AS address_type, country_code,
             admin_area_1, admin_area_2, locality, sub_locality, street_line1, street_line2,
             postal_code, landmark, formatted_address, latitude, longitude, is_default
      FROM addresses
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `,
    [addressId, customerId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Address not found');
  }
  return mapAddress(row);
}

function toLifecycleStatus(status: string): CustomerLifecycleStatus {
  return status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE';
}

function statusAuditAction(status: CustomerLifecycleStatus) {
  return status === 'ACTIVE' ? 'CUSTOMER_ACTIVATED' : 'CUSTOMER_DEACTIVATED';
}

function summaryForAudit(customer: CustomerPayload) {
  return {
    customerReference: customer.customerReference,
    name: customer.name,
    customerType: customer.customerType,
    status: customer.status,
    email: customer.email,
    phoneE164: customer.phoneE164,
    countryCode: customer.countryCode,
    city: customer.city,
  };
}

function mapUniqueViolation(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
    const constraint =
      'constraint' in error && typeof error.constraint === 'string' ? error.constraint : '';
    if (constraint.includes('tax_id')) {
      return conflict(
        'A customer with this tax identification number already exists in this country',
      );
    }
    return conflict('A customer with this business name already exists for this operator');
  }
  return error;
}
