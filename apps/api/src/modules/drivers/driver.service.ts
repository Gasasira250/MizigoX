import {
  availabilityForDriverStatus,
  canTransitionDriver,
  documentAlert,
  worstDocumentAlert,
  type DriverAvailability,
  type DriverPayload,
  type DriverStatus,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { documentSelect, mapDocument } from '../fleet/documents.js';
import {
  applyOperatorFilter,
  assertOperatorAccess,
  nextFleetReference,
  resolveOperatorOrganizationId,
} from '../fleet/tenant.js';
import { emitNotification } from '../notifications/notify.js';
import type { z } from 'zod';
import type {
  createDriverSchema,
  driverDocumentSchema,
  listDriversQuerySchema,
  updateDriverSchema,
  updateDriverStatusSchema,
} from './driver.schemas.js';

type CreateDriverInput = z.infer<typeof createDriverSchema>;
type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
type ListDriversQuery = z.infer<typeof listDriversQuerySchema>;
type StatusInput = z.infer<typeof updateDriverStatusSchema>;
type DocumentInput = z.infer<typeof driverDocumentSchema>;

const SORT_COLUMNS = {
  reference: 'd.reference',
  name: 'd.last_name',
  status: 'd.status',
  availability: 'd.availability',
  licenseExpiresAt: 'd.license_expires_at',
  updatedAt: 'd.updated_at',
} as const;

export async function createDriver(pool: Pool, actor: AuthContext, input: CreateDriverInput) {
  const organizationId = await resolveOperatorOrganizationId(pool, actor, input.organizationId);
  if (input.userId) {
    await assertLinkableUser(pool, organizationId, input.userId);
  }
  const country = await pool.query<{ country_code: string }>(
    'SELECT country_code FROM organizations WHERE id = $1',
    [organizationId],
  );
  const countryCode = country.rows[0]?.country_code ?? 'RW';
  const initialStatus = (input.status ?? 'ACTIVE') as DriverStatus;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const reference = await nextFleetReference(
      client,
      'driver_reference_counters',
      'DRV',
      countryCode,
    );
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO drivers (
          reference, organization_id, user_id, first_name, last_name, phone_e164,
          email, date_of_birth, license_number, license_category, license_issued_at,
          license_expires_at, nationality_country_code, emergency_contact_name,
          emergency_contact_phone_e164, status, availability, notes, created_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        RETURNING id
      `,
      [
        reference,
        organizationId,
        input.userId ?? null,
        input.firstName,
        input.lastName,
        input.phoneE164,
        input.email ?? null,
        input.dateOfBirth ?? null,
        input.licenseNumber ?? null,
        input.licenseCategory ?? null,
        input.licenseIssuedAt ?? null,
        input.licenseExpiresAt ?? null,
        input.nationalityCountryCode ?? null,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone ?? null,
        initialStatus,
        availabilityForDriverStatus(initialStatus),
        input.notes ?? null,
        actor.userId,
      ],
    );
    const id = created.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to create driver');
    }
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: 'DRIVER_CREATED',
      entityType: 'driver',
      entityId: id,
      after: { reference, userId: input.userId ?? null, status: initialStatus },
    });
    return loadDriver(pool, actor, id);
  } catch (error) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(error)) {
      throw conflict('That user account is already linked to a driver');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function listDrivers(pool: Pool, actor: AuthContext, query: ListDriversQuery) {
  const params: unknown[] = [];
  const where = ['d.deleted_at IS NULL'];
  applyOperatorFilter(actor, where, params, 'd.organization_id');

  if (query.status) {
    params.push(query.status);
    where.push(`d.status::text = $${params.length}`);
  }
  if (query.availability) {
    params.push(query.availability);
    where.push(`d.availability::text = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(d.reference) LIKE $${params.length} OR lower(d.first_name) LIKE $${params.length} OR lower(d.last_name) LIKE $${params.length} OR lower(d.phone_e164) LIKE $${params.length} OR lower(coalesce(d.email, '')) LIKE $${params.length} OR lower(coalesce(d.license_number, '')) LIKE $${params.length})`,
    );
  }
  if (query.licenseExpiry) {
    where.push(licenseExpirySql(query.licenseExpiry));
  }

  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM drivers d WHERE ${where.join(' AND ')}`,
    params,
  );
  const sortColumn = SORT_COLUMNS[query.sort];
  const sortDirection = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT d.id
      FROM drivers d
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, d.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const drivers = await Promise.all(result.rows.map((row) => loadDriver(pool, actor, row.id)));
  return {
    drivers,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadDriver(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
): Promise<DriverPayload> {
  const result = await pool.query(
    `
      SELECT
        d.id, d.reference, d.organization_id, o.name AS organization_name,
        d.user_id, u.email AS user_email, d.first_name, d.last_name, d.phone_e164,
        d.email, d.date_of_birth, d.license_number, d.license_category,
        d.license_issued_at, d.license_expires_at, d.nationality_country_code,
        d.emergency_contact_name, d.emergency_contact_phone_e164,
        d.status::text AS status, d.availability::text AS availability, d.notes,
        d.created_by_user_id, d.created_at, d.updated_at,
        NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS created_by_name
      FROM drivers d
      JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN users creator ON creator.id = d.created_by_user_id
      WHERE d.id = $1 AND d.deleted_at IS NULL
    `,
    [driverId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('Driver not found');
  }
  assertOperatorAccess(actor, String(row.organization_id));

  const documents = await pool.query(
    `
      SELECT ${documentSelect('doc')}, doc.driver_id
      FROM driver_documents doc
      LEFT JOIN users u ON u.id = doc.uploaded_by_user_id
      WHERE doc.driver_id = $1 AND doc.deleted_at IS NULL
      ORDER BY doc.created_at DESC
    `,
    [driverId],
  );
  const mappedDocs = documents.rows.map((item) =>
    mapDocument(item as Record<string, unknown>, 'driver_id'),
  );
  const licenseAlert = documentAlert(toDateOnly(row.license_expires_at as Date | string | null));

  return {
    id: String(row.id),
    reference: String(row.reference),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name),
    userId: (row.user_id as string | null) ?? null,
    userEmail: (row.user_email as string | null) ?? null,
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phoneE164: String(row.phone_e164),
    email: (row.email as string | null) ?? null,
    dateOfBirth: toDateOnly(row.date_of_birth as Date | string | null),
    licenseNumber: (row.license_number as string | null) ?? null,
    licenseCategory: (row.license_category as string | null) ?? null,
    licenseIssuedAt: toDateOnly(row.license_issued_at as Date | string | null),
    licenseExpiresAt: toDateOnly(row.license_expires_at as Date | string | null),
    nationalityCountryCode: (row.nationality_country_code as string | null) ?? null,
    emergencyContactName: (row.emergency_contact_name as string | null) ?? null,
    emergencyContactPhone: (row.emergency_contact_phone_e164 as string | null) ?? null,
    status: row.status as DriverStatus,
    availability: row.availability as DriverAvailability,
    notes: (row.notes as string | null) ?? null,
    documentAlert: worstDocumentAlert([licenseAlert, ...mappedDocs.map((doc) => doc.alert)]),
    documents: mappedDocs,
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function updateDriver(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
  input: UpdateDriverInput,
) {
  const current = await loadDriver(pool, actor, driverId);
  if (input.userId) {
    await assertLinkableUser(pool, current.organizationId, input.userId, driverId);
  }
  try {
    await pool.query(
      `
        UPDATE drivers
        SET user_id = CASE WHEN $2::boolean THEN $3 ELSE user_id END,
            first_name = COALESCE($4, first_name),
            last_name = COALESCE($5, last_name),
            phone_e164 = COALESCE($6, phone_e164),
            email = CASE WHEN $7::boolean THEN $8 ELSE email END,
            date_of_birth = CASE WHEN $9::boolean THEN $10 ELSE date_of_birth END,
            license_number = CASE WHEN $11::boolean THEN $12 ELSE license_number END,
            license_category = CASE WHEN $13::boolean THEN $14 ELSE license_category END,
            license_issued_at = CASE WHEN $15::boolean THEN $16 ELSE license_issued_at END,
            license_expires_at = CASE WHEN $17::boolean THEN $18 ELSE license_expires_at END,
            nationality_country_code = CASE WHEN $19::boolean THEN $20 ELSE nationality_country_code END,
            emergency_contact_name = CASE WHEN $21::boolean THEN $22 ELSE emergency_contact_name END,
            emergency_contact_phone_e164 = CASE WHEN $23::boolean THEN $24 ELSE emergency_contact_phone_e164 END,
            notes = CASE WHEN $25::boolean THEN $26 ELSE notes END,
            updated_at = now()
        WHERE id = $1
      `,
      [
        driverId,
        input.userId !== undefined,
        input.userId ?? null,
        input.firstName ?? null,
        input.lastName ?? null,
        input.phoneE164 ?? null,
        input.email !== undefined,
        input.email ?? null,
        input.dateOfBirth !== undefined,
        input.dateOfBirth ?? null,
        input.licenseNumber !== undefined,
        input.licenseNumber ?? null,
        input.licenseCategory !== undefined,
        input.licenseCategory ?? null,
        input.licenseIssuedAt !== undefined,
        input.licenseIssuedAt ?? null,
        input.licenseExpiresAt !== undefined,
        input.licenseExpiresAt ?? null,
        input.nationalityCountryCode !== undefined,
        input.nationalityCountryCode ?? null,
        input.emergencyContactName !== undefined,
        input.emergencyContactName ?? null,
        input.emergencyContactPhone !== undefined,
        input.emergencyContactPhone ?? null,
        input.notes !== undefined,
        input.notes ?? null,
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('That user account is already linked to a driver');
    }
    throw error;
  }
  const updated = await loadDriver(pool, actor, driverId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'DRIVER_UPDATED',
    entityType: 'driver',
    entityId: driverId,
    before: { status: current.status, userId: current.userId },
    after: { status: updated.status, userId: updated.userId },
  });
  return updated;
}

export async function updateDriverStatus(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
  input: StatusInput,
) {
  const current = await loadDriver(pool, actor, driverId);
  if (!canTransitionDriver(current.status, input.status)) {
    throw new AppError(
      422,
      'DRIVER_INVALID_TRANSITION',
      `Cannot move a ${current.status} driver to ${input.status}.`,
    );
  }
  const availability = availabilityForDriverStatus(input.status);
  await pool.query(
    `
      UPDATE drivers
      SET status = $2::driver_status,
          availability = $3::driver_availability,
          updated_at = now()
      WHERE id = $1
    `,
    [driverId, input.status, availability],
  );
  const action =
    input.status === 'INACTIVE' || input.status === 'SUSPENDED'
      ? 'DRIVER_DEACTIVATED'
      : current.status === 'INACTIVE' && (input.status === 'ACTIVE' || input.status === 'AVAILABLE')
        ? 'DRIVER_ACTIVATED'
        : 'DRIVER_STATUS_CHANGED';
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action,
    entityType: 'driver',
    entityId: driverId,
    before: { status: current.status, availability: current.availability },
    after: { status: input.status, availability, note: input.note ?? null },
  });
  const updated = await loadDriver(pool, actor, driverId);
  if (updated.availability === 'UNAVAILABLE') {
    await emitNotification(pool, {
      type: 'DRIVER_UNAVAILABLE',
      organizationId: updated.organizationId,
      operatorOrganizationId: updated.organizationId,
      relatedEntityType: 'driver',
      relatedEntityId: updated.id,
      relatedReference: `${updated.firstName} ${updated.lastName}`,
      actorUserId: actor.userId,
      variables: {
        driver_name: `${updated.firstName} ${updated.lastName}`,
        organization_name: updated.organizationName,
      },
    });
  }
  return updated;
}

export async function archiveDriver(pool: Pool, actor: AuthContext, driverId: string) {
  const current = await loadDriver(pool, actor, driverId);
  if (current.status !== 'INACTIVE' && current.status !== 'SUSPENDED') {
    throw unprocessable('Only inactive or suspended drivers can be archived');
  }
  await pool.query('UPDATE drivers SET deleted_at = now(), updated_at = now() WHERE id = $1', [
    driverId,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'DRIVER_ARCHIVED',
    entityType: 'driver',
    entityId: driverId,
    before: { reference: current.reference, status: current.status },
  });
  return { id: driverId, archived: true };
}

export async function addDriverDocument(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
  input: DocumentInput,
) {
  const current = await loadDriver(pool, actor, driverId);
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO driver_documents (
        driver_id, organization_id, document_type, document_number,
        issued_at, expires_at, status, storage_provider, storage_key, file_url,
        notes, uploaded_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `,
    [
      driverId,
      current.organizationId,
      input.documentType,
      input.documentNumber ?? null,
      input.issuedAt ?? null,
      input.expiresAt ?? null,
      input.status ?? 'VALID',
      input.storageKey || input.fileUrl ? 'external' : 'pending',
      input.storageKey ?? null,
      input.fileUrl ?? null,
      input.notes ?? null,
      actor.userId,
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'DRIVER_DOCUMENT_ADDED',
    entityType: 'driver_document',
    entityId: created.rows[0]?.id,
    after: { driverId, documentType: input.documentType },
  });
  return loadDriver(pool, actor, driverId);
}

export async function updateDriverDocument(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
  documentId: string,
  input: Partial<DocumentInput>,
) {
  const current = await loadDriver(pool, actor, driverId);
  if (!current.documents.some((doc) => doc.id === documentId)) {
    throw notFound('Document not found');
  }
  const updated = await pool.query(
    `
      UPDATE driver_documents
      SET document_type = COALESCE($3::driver_document_type, document_type),
          document_number = CASE WHEN $4::boolean THEN $5 ELSE document_number END,
          issued_at = CASE WHEN $6::boolean THEN $7 ELSE issued_at END,
          expires_at = CASE WHEN $8::boolean THEN $9 ELSE expires_at END,
          status = COALESCE($10::fleet_document_status, status),
          storage_key = CASE WHEN $11::boolean THEN $12 ELSE storage_key END,
          file_url = CASE WHEN $13::boolean THEN $14 ELSE file_url END,
          storage_provider = CASE
            WHEN $11::boolean OR $13::boolean THEN 'external'
            ELSE storage_provider
          END,
          notes = CASE WHEN $15::boolean THEN $16 ELSE notes END
      WHERE id = $1 AND driver_id = $2 AND deleted_at IS NULL
    `,
    [
      documentId,
      driverId,
      input.documentType ?? null,
      input.documentNumber !== undefined,
      input.documentNumber ?? null,
      input.issuedAt !== undefined,
      input.issuedAt ?? null,
      input.expiresAt !== undefined,
      input.expiresAt ?? null,
      input.status ?? null,
      input.storageKey !== undefined,
      input.storageKey ?? null,
      input.fileUrl !== undefined,
      input.fileUrl ?? null,
      input.notes !== undefined,
      input.notes ?? null,
    ],
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw notFound('Document not found');
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'DRIVER_DOCUMENT_UPDATED',
    entityType: 'driver_document',
    entityId: documentId,
  });
  return loadDriver(pool, actor, driverId);
}

export async function removeDriverDocument(
  pool: Pool,
  actor: AuthContext,
  driverId: string,
  documentId: string,
) {
  const current = await loadDriver(pool, actor, driverId);
  const existing = current.documents.find((doc) => doc.id === documentId);
  if (!existing) {
    throw notFound('Document not found');
  }
  await pool.query(
    'UPDATE driver_documents SET deleted_at = now(), updated_at = now() WHERE id = $1 AND driver_id = $2',
    [documentId, driverId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'DRIVER_DOCUMENT_REMOVED',
    entityType: 'driver_document',
    entityId: documentId,
    before: { documentType: existing.documentType },
  });
  return loadDriver(pool, actor, driverId);
}

export async function listDriverActivity(pool: Pool, actor: AuthContext, driverId: string) {
  const current = await loadDriver(pool, actor, driverId);
  const result = await pool.query(
    `
      SELECT action, entity_type, before, after, created_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE (a.entity_id = $1 OR a.after->>'driverId' = $1)
      ORDER BY a.created_at DESC
      LIMIT 50
    `,
    [driverId],
  );
  return {
    driverId: current.id,
    events: result.rows.map((row) => ({
      action: String(row.action),
      entityType: String(row.entity_type),
      actorName: (row.actor_name as string | null) ?? null,
      before: row.before,
      after: row.after,
      createdAt: (row.created_at as Date).toISOString(),
    })),
  };
}

export async function listLinkableUsers(pool: Pool, actor: AuthContext, organizationId?: string) {
  const orgId = await resolveOperatorOrganizationId(pool, actor, organizationId);
  const result = await pool.query(
    `
      SELECT u.id, u.email, u.first_name, u.last_name, r.code AS role
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      JOIN roles r ON r.id = m.role_id
      WHERE m.organization_id = $1
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM drivers d
          WHERE d.user_id = u.id AND d.deleted_at IS NULL
        )
      ORDER BY u.last_name, u.first_name
    `,
    [orgId],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    role: String(row.role),
  }));
}

async function assertLinkableUser(
  pool: Pool,
  organizationId: string,
  userId: string,
  excludeDriverId?: string,
) {
  const membership = await pool.query<{ id: string }>(
    `
      SELECT u.id
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      WHERE u.id = $1 AND m.organization_id = $2 AND u.deleted_at IS NULL
    `,
    [userId, organizationId],
  );
  if (!membership.rows[0]) {
    throw forbidden('User is not an active member of this transporter organization');
  }
  const existing = await pool.query<{ id: string }>(
    `
      SELECT id FROM drivers
      WHERE user_id = $1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id <> $2)
      LIMIT 1
    `,
    [userId, excludeDriverId ?? null],
  );
  if (existing.rows[0]) {
    throw conflict('That user account is already linked to a driver');
  }
}

function licenseExpirySql(window: 'expired' | 'today' | '7' | '30') {
  if (window === 'expired') return 'd.license_expires_at < CURRENT_DATE';
  if (window === 'today') return 'd.license_expires_at = CURRENT_DATE';
  if (window === '7') {
    return `d.license_expires_at >= CURRENT_DATE AND d.license_expires_at <= CURRENT_DATE + INTERVAL '7 days'`;
  }
  return `d.license_expires_at >= CURRENT_DATE AND d.license_expires_at <= CURRENT_DATE + INTERVAL '30 days'`;
}

function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}
