import type { Pool } from 'pg';
import type { NotificationEvent, ResolvedRecipient } from './notification.types.js';

const OPS_ROLES = ['COMPANY_ADMIN', 'LOGISTICS_MANAGER', 'OPERATIONS_ADMIN'] as const;
const FINANCE_ROLES = ['COMPANY_ADMIN', 'FINANCE_OFFICER', 'FINANCE_ADMIN'] as const;
const CUSTOMER_ROLES = ['CUSTOMER_ADMIN', 'CUSTOMER_USER'] as const;

async function membersByRoles(
  pool: Pool,
  organizationId: string,
  roles: readonly string[],
): Promise<ResolvedRecipient[]> {
  const result = await pool.query<{
    user_id: string;
    organization_id: string;
    email: string;
    phone_e164: string | null;
    first_name: string;
    last_name: string;
    role: string;
    org_type: string;
  }>(
    `
      SELECT u.id AS user_id,
             om.organization_id,
             u.email,
             u.phone_e164,
             u.first_name,
             u.last_name,
             r.code AS role,
             o.type::text AS org_type
      FROM organization_memberships om
      JOIN users u ON u.id = om.user_id
      JOIN roles r ON r.id = om.role_id
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.organization_id = $1
        AND om.status = 'ACTIVE'
        AND u.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        AND r.code = ANY($2::text[])
    `,
    [organizationId, [...roles]],
  );
  return result.rows.map(toRecipient);
}

function toRecipient(row: {
  user_id: string;
  organization_id: string;
  email: string;
  phone_e164: string | null;
  first_name: string;
  last_name: string;
  role: string;
  org_type: string;
}): ResolvedRecipient {
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email,
    phone: row.phone_e164,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    orgType: row.org_type,
  };
}

function mergeRecipients(...groups: ResolvedRecipient[][]) {
  const byUser = new Map<string, ResolvedRecipient>();
  const extras: ResolvedRecipient[] = [];
  for (const group of groups) {
    for (const recipient of group) {
      if (recipient.userId) {
        byUser.set(recipient.userId, recipient);
      } else {
        extras.push(recipient);
      }
    }
  }
  return [...byUser.values(), ...extras];
}

async function loadUser(pool: Pool, userId: string): Promise<ResolvedRecipient | null> {
  const result = await pool.query<{
    user_id: string;
    organization_id: string;
    email: string;
    phone_e164: string | null;
    first_name: string;
    last_name: string;
    role: string;
    org_type: string;
  }>(
    `
      SELECT u.id AS user_id,
             om.organization_id,
             u.email,
             u.phone_e164,
             u.first_name,
             u.last_name,
             r.code AS role,
             o.type::text AS org_type
      FROM users u
      JOIN organization_memberships om ON om.user_id = u.id AND om.status = 'ACTIVE'
      JOIN roles r ON r.id = om.role_id
      JOIN organizations o ON o.id = om.organization_id
      WHERE u.id = $1 AND u.deleted_at IS NULL
      ORDER BY om.created_at
      LIMIT 1
    `,
    [userId],
  );
  const row = result.rows[0];
  return row ? toRecipient(row) : null;
}

async function loadDriverUser(pool: Pool, driverId: string): Promise<ResolvedRecipient | null> {
  const result = await pool.query<{
    user_id: string | null;
    organization_id: string;
    email: string | null;
    phone_e164: string;
    first_name: string;
    last_name: string;
  }>(
    `
      SELECT user_id, organization_id, email, phone_e164, first_name, last_name
      FROM drivers
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [driverId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  if (row.user_id) {
    const linked = await loadUser(pool, row.user_id);
    if (linked) {
      return { ...linked, phone: linked.phone ?? row.phone_e164 };
    }
  }
  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    email: row.email,
    phone: row.phone_e164,
    firstName: row.first_name,
    lastName: row.last_name,
    role: 'DRIVER',
    orgType: 'OPERATOR',
  };
}

export async function resolveRecipients(
  pool: Pool,
  event: NotificationEvent,
): Promise<ResolvedRecipient[]> {
  if (event.recipientUserId) {
    const user = await loadUser(pool, event.recipientUserId);
    return user ? [user] : [];
  }

  if (event.recipientEmail && !event.recipientUserId) {
    return [
      {
        userId: null,
        organizationId: event.organizationId,
        email: event.recipientEmail,
        phone: event.recipientPhone ?? null,
        firstName: '',
        lastName: '',
        role: 'INVITED',
        orgType: 'OPERATOR',
      },
    ];
  }

  const customerId = event.customerOrganizationId;
  const operatorId = event.operatorOrganizationId ?? event.organizationId;
  const categoryPrefix = event.type.split('_')[0];

  if (event.type === 'ROUTE_DRIVER_ASSIGNED' && event.driverId) {
    const driver = await loadDriverUser(pool, event.driverId);
    const ops = await membersByRoles(pool, operatorId, ['COMPANY_ADMIN', 'LOGISTICS_MANAGER']);
    return mergeRecipients(driver ? [driver] : [], ops);
  }

  if (event.type.startsWith('ROUTE_') || event.type.startsWith('TRACKING_')) {
    const ops = await membersByRoles(pool, operatorId, OPS_ROLES);
    const driver = event.driverId ? await loadDriverUser(pool, event.driverId) : null;
    const customers = customerId ? await membersByRoles(pool, customerId, CUSTOMER_ROLES) : [];
    if (event.type === 'ROUTE_DISPATCHED' || event.type === 'TRACKING_STARTED') {
      return mergeRecipients(ops, driver ? [driver] : [], customers);
    }
    return mergeRecipients(ops, driver ? [driver] : []);
  }

  if (categoryPrefix === 'INVOICE' || event.type.startsWith('PAYMENT_')) {
    const finance = await membersByRoles(pool, operatorId, FINANCE_ROLES);
    const customers = customerId ? await membersByRoles(pool, customerId, CUSTOMER_ROLES) : [];
    return mergeRecipients(finance, customers);
  }

  if (
    event.type.startsWith('VEHICLE_') ||
    event.type.startsWith('DRIVER_') ||
    event.type === 'DRIVER_LICENSE_EXPIRING' ||
    event.type === 'DRIVER_DOCUMENT_EXPIRED' ||
    event.type === 'DRIVER_UNAVAILABLE'
  ) {
    return membersByRoles(pool, operatorId, OPS_ROLES);
  }

  if (event.type.startsWith('SHIPMENT_')) {
    const customers = customerId ? await membersByRoles(pool, customerId, CUSTOMER_ROLES) : [];
    const ops = await membersByRoles(pool, operatorId, OPS_ROLES);
    return mergeRecipients(customers, ops);
  }

  if (event.type === 'PASSWORD_CHANGED' || event.type === 'ACCOUNT_CREATED') {
    return [];
  }

  return membersByRoles(pool, event.organizationId, OPS_ROLES);
}
