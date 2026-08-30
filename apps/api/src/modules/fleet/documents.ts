import {
  documentAlert,
  type DocumentAlert,
  type DocumentExpiryPayload,
  type FleetDocumentPayload,
  type FleetDocumentStatus,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import type { AuthContext } from '../auth/auth.types.js';
import { applyOperatorFilter } from './tenant.js';

export function mapDocument(
  row: Record<string, unknown>,
  ownerIdColumn: 'vehicle_id' | 'driver_id',
): FleetDocumentPayload {
  const expiresAt = toDateOnly(row.expires_at as Date | string | null);
  return {
    id: String(row.id),
    ownerId: String(row[ownerIdColumn]),
    organizationId: String(row.organization_id),
    documentType: String(row.document_type),
    documentNumber: (row.document_number as string | null) ?? null,
    issuedAt: toDateOnly(row.issued_at as Date | string | null),
    expiresAt,
    status: row.status as FleetDocumentStatus,
    alert: documentAlert(expiresAt),
    storageProvider: String(row.storage_provider ?? 'pending'),
    storageKey: (row.storage_key as string | null) ?? null,
    fileUrl: (row.file_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    uploadedByUserId: (row.uploaded_by_user_id as string | null) ?? null,
    uploadedByName: (row.uploaded_by_name as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export function toDateOnly(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

export function documentSelect(alias = 'd') {
  return `
    ${alias}.id, ${alias}.organization_id, ${alias}.document_type::text AS document_type,
    ${alias}.document_number, ${alias}.issued_at, ${alias}.expires_at,
    ${alias}.status::text AS status, ${alias}.storage_provider, ${alias}.storage_key,
    ${alias}.file_url, ${alias}.notes, ${alias}.uploaded_by_user_id,
    ${alias}.created_at, ${alias}.updated_at,
    NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS uploaded_by_name
  `;
}

export async function listExpiringDocuments(
  pool: Pool,
  actor: AuthContext,
  window: 'expired' | 'today' | '7' | '30',
): Promise<DocumentExpiryPayload[]> {
  const where = ['d.deleted_at IS NULL', 'd.expires_at IS NOT NULL', "d.status <> 'REVOKED'"];
  const params: unknown[] = [];
  applyOperatorFilter(actor, where, params, 'd.organization_id');

  if (window === 'expired') {
    where.push('d.expires_at < CURRENT_DATE');
  } else if (window === 'today') {
    where.push('d.expires_at = CURRENT_DATE');
  } else if (window === '7') {
    where.push(`d.expires_at >= CURRENT_DATE AND d.expires_at <= CURRENT_DATE + INTERVAL '7 days'`);
  } else {
    where.push(
      `d.expires_at >= CURRENT_DATE AND d.expires_at <= CURRENT_DATE + INTERVAL '30 days'`,
    );
  }

  const vehicles = await pool.query(
    `
      SELECT d.id, d.vehicle_id AS owner_id, v.reference AS owner_reference,
             coalesce(v.registration_number, v.reference) AS owner_name,
             d.organization_id, d.document_type::text AS document_type,
             d.document_number, d.expires_at, d.status::text AS status
      FROM vehicle_documents d
      JOIN vehicles v ON v.id = d.vehicle_id
      WHERE ${where.join(' AND ')}
        AND v.deleted_at IS NULL
      ORDER BY d.expires_at ASC
    `,
    params,
  );
  const drivers = await pool.query(
    `
      SELECT d.id, d.driver_id AS owner_id, dr.reference AS owner_reference,
             trim(concat_ws(' ', dr.first_name, dr.last_name)) AS owner_name,
             d.organization_id, d.document_type::text AS document_type,
             d.document_number, d.expires_at, d.status::text AS status
      FROM driver_documents d
      JOIN drivers dr ON dr.id = d.driver_id
      WHERE ${where.join(' AND ')}
        AND dr.deleted_at IS NULL
      ORDER BY d.expires_at ASC
    `,
    params,
  );

  const mapRow = (
    row: Record<string, unknown>,
    ownerType: 'vehicle' | 'driver',
  ): DocumentExpiryPayload => {
    const expiresAt = toDateOnly(row.expires_at as Date | string | null);
    return {
      id: String(row.id),
      ownerType,
      ownerId: String(row.owner_id),
      ownerReference: String(row.owner_reference),
      ownerName: String(row.owner_name),
      organizationId: String(row.organization_id),
      documentType: String(row.document_type),
      documentNumber: (row.document_number as string | null) ?? null,
      expiresAt,
      alert: documentAlert(expiresAt) as DocumentAlert,
      status: row.status as FleetDocumentStatus,
    };
  };

  return [
    ...vehicles.rows.map((row) => mapRow(row as Record<string, unknown>, 'vehicle')),
    ...drivers.rows.map((row) => mapRow(row as Record<string, unknown>, 'driver')),
  ].sort((left, right) => (left.expiresAt ?? '').localeCompare(right.expiresAt ?? ''));
}
