import { documentAlert } from '@mizigox/shared';
import type { Pool } from 'pg';
import { getEnv } from '../../config/env.js';
import { emitNotification } from './notify.js';

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sixHourKey(date = new Date()) {
  const hour = Math.floor(date.getUTCHours() / 6) * 6;
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}`;
}

export async function runNotificationScans(pool: Pool) {
  await scanVehicleDocuments(pool);
  await scanDriverLicenses(pool);
  await scanDriverDocuments(pool);
  await scanInvoiceDueSoon(pool);
  await scanInvoiceOverdue(pool);
  await scanStaleTracking(pool);
}

async function scanVehicleDocuments(pool: Pool) {
  const result = await pool.query<{
    id: string;
    vehicle_id: string;
    organization_id: string;
    document_type: string;
    expires_at: Date;
    registration_number: string;
    organization_name: string;
  }>(
    `
      SELECT d.id, d.vehicle_id, d.organization_id, d.document_type, d.expires_at,
             v.registration_number, o.name AS organization_name
      FROM vehicle_documents d
      JOIN vehicles v ON v.id = d.vehicle_id
      JOIN organizations o ON o.id = d.organization_id
      WHERE v.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND d.status <> 'REVOKED'
        AND d.expires_at IS NOT NULL
        AND d.expires_at <= CURRENT_DATE + INTERVAL '30 days'
    `,
  );
  for (const row of result.rows) {
    const expiresAt = row.expires_at.toISOString().slice(0, 10);
    const alert = documentAlert(expiresAt);
    if (alert !== 'expired' && alert !== 'today' && alert !== 'week' && alert !== 'month') {
      continue;
    }
    const type = alert === 'expired' ? 'VEHICLE_DOCUMENT_EXPIRED' : 'VEHICLE_DOCUMENT_EXPIRING';
    await emitNotification(pool, {
      type,
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      relatedEntityType: 'vehicle',
      relatedEntityId: row.vehicle_id,
      relatedReference: row.registration_number,
      idempotencySuffix: dayKey(),
      variables: {
        vehicle_registration: row.registration_number,
        document_type: row.document_type.replaceAll('_', ' '),
        expiry_date: expiresAt,
        organization_name: row.organization_name,
      },
    });
  }
}

async function scanDriverLicenses(pool: Pool) {
  const result = await pool.query<{
    id: string;
    organization_id: string;
    first_name: string;
    last_name: string;
    license_expires_at: Date;
    organization_name: string;
  }>(
    `
      SELECT d.id, d.organization_id, d.first_name, d.last_name, d.license_expires_at,
             o.name AS organization_name
      FROM drivers d
      JOIN organizations o ON o.id = d.organization_id
      WHERE d.deleted_at IS NULL
        AND d.license_expires_at IS NOT NULL
        AND d.license_expires_at <= CURRENT_DATE + INTERVAL '30 days'
    `,
  );
  for (const row of result.rows) {
    const expiresAt = row.license_expires_at.toISOString().slice(0, 10);
    const alert = documentAlert(expiresAt);
    if (alert === 'none' || alert === 'ok') {
      continue;
    }
    await emitNotification(pool, {
      type: 'DRIVER_LICENSE_EXPIRING',
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      relatedEntityType: 'driver',
      relatedEntityId: row.id,
      relatedReference: `${row.first_name} ${row.last_name}`,
      idempotencySuffix: dayKey(),
      variables: {
        driver_name: `${row.first_name} ${row.last_name}`,
        expiry_date: expiresAt,
        organization_name: row.organization_name,
      },
    });
  }
}

async function scanDriverDocuments(pool: Pool) {
  const result = await pool.query<{
    id: string;
    driver_id: string;
    organization_id: string;
    document_type: string;
    expires_at: Date;
    first_name: string;
    last_name: string;
    organization_name: string;
  }>(
    `
      SELECT d.id, d.driver_id, d.organization_id, d.document_type, d.expires_at,
             dr.first_name, dr.last_name, o.name AS organization_name
      FROM driver_documents d
      JOIN drivers dr ON dr.id = d.driver_id
      JOIN organizations o ON o.id = d.organization_id
      WHERE dr.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND d.status <> 'REVOKED'
        AND d.expires_at IS NOT NULL
        AND d.expires_at < CURRENT_DATE
    `,
  );
  for (const row of result.rows) {
    await emitNotification(pool, {
      type: 'DRIVER_DOCUMENT_EXPIRED',
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      relatedEntityType: 'driver',
      relatedEntityId: row.driver_id,
      relatedReference: `${row.first_name} ${row.last_name}`,
      idempotencySuffix: dayKey(),
      variables: {
        driver_name: `${row.first_name} ${row.last_name}`,
        document_type: row.document_type.replaceAll('_', ' '),
        expiry_date: row.expires_at.toISOString().slice(0, 10),
        organization_name: row.organization_name,
      },
    });
  }
}

async function scanInvoiceDueSoon(pool: Pool) {
  const result = await pool.query<{
    id: string;
    number: string;
    organization_id: string;
    customer_organization_id: string;
    total_amount: string;
    currency_code: string;
    due_date: Date;
    customer_name: string;
  }>(
    `
      SELECT i.id, i.number, i.organization_id, i.customer_organization_id,
             i.total_amount::text, i.currency_code, i.due_date, c.name AS customer_name
      FROM invoices i
      JOIN organizations c ON c.id = i.customer_organization_id
      WHERE i.deleted_at IS NULL
        AND i.status IN ('ISSUED', 'PARTIALLY_PAID')
        AND i.due_date IS NOT NULL
        AND i.due_date >= CURRENT_DATE
        AND i.due_date <= CURRENT_DATE + INTERVAL '3 days'
    `,
  );
  for (const row of result.rows) {
    await emitNotification(pool, {
      type: 'INVOICE_DUE_SOON',
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      customerOrganizationId: row.customer_organization_id,
      relatedEntityType: 'invoice',
      relatedEntityId: row.id,
      relatedReference: row.number,
      idempotencySuffix: dayKey(),
      variables: {
        invoice_number: row.number,
        customer_name: row.customer_name,
        amount: row.total_amount,
        currency: row.currency_code,
        due_date: row.due_date.toISOString().slice(0, 10),
      },
    });
  }
}

async function scanInvoiceOverdue(pool: Pool) {
  const result = await pool.query<{
    id: string;
    number: string;
    organization_id: string;
    customer_organization_id: string;
    total_amount: string;
    currency_code: string;
    due_date: Date;
    customer_name: string;
  }>(
    `
      SELECT i.id, i.number, i.organization_id, i.customer_organization_id,
             i.total_amount::text, i.currency_code, i.due_date, c.name AS customer_name
      FROM invoices i
      JOIN organizations c ON c.id = i.customer_organization_id
      WHERE i.deleted_at IS NULL
        AND i.status = 'OVERDUE'
        AND i.due_date IS NOT NULL
    `,
  );
  for (const row of result.rows) {
    await emitNotification(pool, {
      type: 'INVOICE_OVERDUE',
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      customerOrganizationId: row.customer_organization_id,
      relatedEntityType: 'invoice',
      relatedEntityId: row.id,
      relatedReference: row.number,
      idempotencySuffix: row.due_date.toISOString().slice(0, 10),
      variables: {
        invoice_number: row.number,
        customer_name: row.customer_name,
        amount: row.total_amount,
        currency: row.currency_code,
        due_date: row.due_date.toISOString().slice(0, 10),
      },
    });
  }
}

async function scanStaleTracking(pool: Pool) {
  const env = getEnv();
  const result = await pool.query<{
    vehicle_id: string;
    organization_id: string;
    registration_number: string;
    last_updated_at: Date;
  }>(
    `
      SELECT l.vehicle_id, l.organization_id, v.registration_number, l.last_updated_at
      FROM vehicle_current_locations l
      JOIN vehicles v ON v.id = l.vehicle_id
      JOIN routes r ON r.id = l.route_id
      WHERE v.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND r.status IN ('DISPATCHED', 'IN_TRANSIT')
        AND l.last_updated_at < now() - ($1::int * interval '1 second')
    `,
    [env.TRACKING_STALE_SECONDS],
  );
  for (const row of result.rows) {
    await emitNotification(pool, {
      type: 'TRACKING_LOCATION_STALE',
      organizationId: row.organization_id,
      operatorOrganizationId: row.organization_id,
      relatedEntityType: 'vehicle',
      relatedEntityId: row.vehicle_id,
      relatedReference: row.registration_number,
      idempotencySuffix: sixHourKey(),
      variables: {
        vehicle_registration: row.registration_number,
      },
    });
  }
}
