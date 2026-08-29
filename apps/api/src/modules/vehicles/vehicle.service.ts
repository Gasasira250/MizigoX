import {
  availabilityForVehicleStatus,
  canTransitionVehicle,
  worstDocumentAlert,
  type VehicleAvailability,
  type VehiclePayload,
  type VehicleStatus,
  type VehicleTypePayload,
} from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { toNumber } from '../../lib/addresses.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError, conflict, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { documentSelect, mapDocument } from '../fleet/documents.js';
import {
  applyOperatorFilter,
  assertOperatorAccess,
  nextFleetReference,
  normalizeRegistration,
  resolveOperatorOrganizationId,
} from '../fleet/tenant.js';
import type { z } from 'zod';
import type {
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  updateVehicleStatusSchema,
  vehicleDocumentSchema,
} from './vehicle.schemas.js';

type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
type StatusInput = z.infer<typeof updateVehicleStatusSchema>;
type DocumentInput = z.infer<typeof vehicleDocumentSchema>;

const SORT_COLUMNS = {
  reference: 'v.reference',
  registrationNumber: 'v.registration_number',
  vehicleType: 'v.vehicle_type_code',
  status: 'v.status',
  availability: 'v.availability',
  updatedAt: 'v.updated_at',
  payloadCapacity: 'v.payload_capacity',
} as const;

export async function listVehicleTypes(pool: Pool): Promise<VehicleTypePayload[]> {
  const result = await pool.query(
    `
      SELECT code, name, is_active, sort_order
      FROM vehicle_types
      WHERE is_active = true
      ORDER BY sort_order, name
    `,
  );
  return result.rows.map((row) => ({
    code: String(row.code),
    name: String(row.name),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order),
  }));
}

export async function createVehicle(pool: Pool, actor: AuthContext, input: CreateVehicleInput) {
  const organizationId = await resolveOperatorOrganizationId(pool, actor, input.organizationId);
  const registrationNormalized = normalizeRegistration(input.registrationNumber);
  await assertUniqueRegistration(pool, organizationId, registrationNormalized);

  const country = await pool.query<{ country_code: string }>(
    'SELECT country_code FROM organizations WHERE id = $1',
    [organizationId],
  );
  const countryCode = country.rows[0]?.country_code ?? 'RW';
  const initialStatus = (input.status ?? 'ACTIVE') as VehicleStatus;
  const availability = availabilityForVehicleStatus(initialStatus);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const reference = await nextFleetReference(
      client,
      'vehicle_reference_counters',
      'VEH',
      countryCode,
    );
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO vehicles (
          reference, organization_id, vehicle_type_code, registration_number,
          registration_normalized, make, model, year, color, vin, engine_number,
          payload_capacity, payload_unit, length_m, width_m, height_m,
          fuel_type, ownership_type, status, availability, notes, created_by_user_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING id
      `,
      [
        reference,
        organizationId,
        input.vehicleType,
        input.registrationNumber.trim().toUpperCase(),
        registrationNormalized,
        input.make ?? null,
        input.model ?? null,
        input.year ?? null,
        input.color ?? null,
        input.vin ?? null,
        input.engineNumber ?? null,
        input.payloadCapacity ?? null,
        input.payloadUnit,
        input.lengthM ?? null,
        input.widthM ?? null,
        input.heightM ?? null,
        input.fuelType ?? null,
        input.ownershipType,
        initialStatus,
        availability,
        input.notes ?? null,
        actor.userId,
      ],
    );
    const id = created.rows[0]?.id;
    if (!id) {
      throw new Error('Failed to create vehicle');
    }
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: 'VEHICLE_CREATED',
      entityType: 'vehicle',
      entityId: id,
      after: { reference, registrationNumber: input.registrationNumber, status: initialStatus },
    });
    return loadVehicle(pool, actor, id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listVehicles(pool: Pool, actor: AuthContext, query: ListVehiclesQuery) {
  const params: unknown[] = [];
  const where = ['v.deleted_at IS NULL'];
  applyOperatorFilter(actor, where, params, 'v.organization_id');

  if (query.status) {
    params.push(query.status);
    where.push(`v.status::text = $${params.length}`);
  }
  if (query.availability) {
    params.push(query.availability);
    where.push(`v.availability::text = $${params.length}`);
  }
  if (query.vehicleType) {
    params.push(query.vehicleType);
    where.push(`v.vehicle_type_code = $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(v.reference) LIKE $${params.length} OR lower(v.registration_number) LIKE $${params.length} OR lower(coalesce(v.make, '')) LIKE $${params.length} OR lower(coalesce(v.model, '')) LIKE $${params.length})`,
    );
  }
  if (query.documentAlert) {
    where.push(documentAlertSql('v.id', query.documentAlert));
  }

  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM vehicles v WHERE ${where.join(' AND ')}`,
    params,
  );
  const sortColumn = SORT_COLUMNS[query.sort];
  const sortDirection = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT v.id
      FROM vehicles v
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, v.updated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const vehicles = await Promise.all(result.rows.map((row) => loadVehicle(pool, actor, row.id)));
  return {
    vehicles,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadVehicle(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
): Promise<VehiclePayload> {
  const result = await pool.query(
    `
      SELECT
        v.id, v.reference, v.organization_id, o.name AS organization_name,
        v.vehicle_type_code, t.name AS vehicle_type_name,
        v.registration_number, v.make, v.model, v.year, v.color, v.vin, v.engine_number,
        v.payload_capacity, v.payload_unit::text AS payload_unit,
        v.length_m, v.width_m, v.height_m, v.fuel_type::text AS fuel_type,
        v.ownership_type::text AS ownership_type, v.status::text AS status,
        v.availability::text AS availability, v.notes, v.created_by_user_id,
        v.created_at, v.updated_at,
        NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), '') AS created_by_name
      FROM vehicles v
      JOIN organizations o ON o.id = v.organization_id
      JOIN vehicle_types t ON t.code = v.vehicle_type_code
      LEFT JOIN users creator ON creator.id = v.created_by_user_id
      WHERE v.id = $1 AND v.deleted_at IS NULL
    `,
    [vehicleId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw notFound('Vehicle not found');
  }
  assertOperatorAccess(actor, String(row.organization_id));

  const documents = await pool.query(
    `
      SELECT ${documentSelect('d')}, d.vehicle_id
      FROM vehicle_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by_user_id
      WHERE d.vehicle_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `,
    [vehicleId],
  );
  const mappedDocs = documents.rows.map((item) =>
    mapDocument(item as Record<string, unknown>, 'vehicle_id'),
  );

  return {
    id: String(row.id),
    reference: String(row.reference),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name),
    vehicleType: String(row.vehicle_type_code),
    vehicleTypeName: String(row.vehicle_type_name),
    registrationNumber: String(row.registration_number),
    make: (row.make as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    year: (row.year as number | null) ?? null,
    color: (row.color as string | null) ?? null,
    vin: (row.vin as string | null) ?? null,
    engineNumber: (row.engine_number as string | null) ?? null,
    payloadCapacity: toNumber(row.payload_capacity as string | null),
    payloadUnit: String(row.payload_unit ?? 'KG'),
    lengthM: toNumber(row.length_m as string | null),
    widthM: toNumber(row.width_m as string | null),
    heightM: toNumber(row.height_m as string | null),
    fuelType: (row.fuel_type as string | null) ?? null,
    ownershipType: String(row.ownership_type ?? 'OWNED'),
    status: row.status as VehicleStatus,
    availability: row.availability as VehicleAvailability,
    notes: (row.notes as string | null) ?? null,
    documentAlert: worstDocumentAlert(mappedDocs.map((doc) => doc.alert)),
    documents: mappedDocs,
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

export async function updateVehicle(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
  input: UpdateVehicleInput,
) {
  const current = await loadVehicle(pool, actor, vehicleId);
  if (current.status === 'RETIRED') {
    throw unprocessable('Retired vehicles cannot be edited');
  }
  if (input.registrationNumber) {
    await assertUniqueRegistration(
      pool,
      current.organizationId,
      normalizeRegistration(input.registrationNumber),
      vehicleId,
    );
  }
  await pool.query(
    `
      UPDATE vehicles
      SET vehicle_type_code = COALESCE($2, vehicle_type_code),
          registration_number = COALESCE($3, registration_number),
          registration_normalized = COALESCE($4, registration_normalized),
          make = CASE WHEN $5::boolean THEN $6 ELSE make END,
          model = CASE WHEN $7::boolean THEN $8 ELSE model END,
          year = CASE WHEN $9::boolean THEN $10 ELSE year END,
          color = CASE WHEN $11::boolean THEN $12 ELSE color END,
          vin = CASE WHEN $13::boolean THEN $14 ELSE vin END,
          engine_number = CASE WHEN $15::boolean THEN $16 ELSE engine_number END,
          payload_capacity = CASE WHEN $17::boolean THEN $18 ELSE payload_capacity END,
          payload_unit = COALESCE($19::payload_unit, payload_unit),
          length_m = CASE WHEN $20::boolean THEN $21 ELSE length_m END,
          width_m = CASE WHEN $22::boolean THEN $23 ELSE width_m END,
          height_m = CASE WHEN $24::boolean THEN $25 ELSE height_m END,
          fuel_type = CASE WHEN $26::boolean THEN $27::fuel_type ELSE fuel_type END,
          ownership_type = COALESCE($28::ownership_type, ownership_type),
          notes = CASE WHEN $29::boolean THEN $30 ELSE notes END,
          updated_at = now()
      WHERE id = $1
    `,
    [
      vehicleId,
      input.vehicleType ?? null,
      input.registrationNumber ? input.registrationNumber.trim().toUpperCase() : null,
      input.registrationNumber ? normalizeRegistration(input.registrationNumber) : null,
      input.make !== undefined,
      input.make ?? null,
      input.model !== undefined,
      input.model ?? null,
      input.year !== undefined,
      input.year ?? null,
      input.color !== undefined,
      input.color ?? null,
      input.vin !== undefined,
      input.vin ?? null,
      input.engineNumber !== undefined,
      input.engineNumber ?? null,
      input.payloadCapacity !== undefined,
      input.payloadCapacity ?? null,
      input.payloadUnit ?? null,
      input.lengthM !== undefined,
      input.lengthM ?? null,
      input.widthM !== undefined,
      input.widthM ?? null,
      input.heightM !== undefined,
      input.heightM ?? null,
      input.fuelType !== undefined,
      input.fuelType ?? null,
      input.ownershipType ?? null,
      input.notes !== undefined,
      input.notes ?? null,
    ],
  );
  const updated = await loadVehicle(pool, actor, vehicleId);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'VEHICLE_UPDATED',
    entityType: 'vehicle',
    entityId: vehicleId,
    before: { registrationNumber: current.registrationNumber, status: current.status },
    after: { registrationNumber: updated.registrationNumber, status: updated.status },
  });
  return updated;
}

export async function updateVehicleStatus(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
  input: StatusInput,
) {
  const current = await loadVehicle(pool, actor, vehicleId);
  if (!canTransitionVehicle(current.status, input.status)) {
    throw new AppError(
      422,
      'VEHICLE_INVALID_TRANSITION',
      `Cannot move a ${current.status} vehicle to ${input.status}.`,
    );
  }
  const availability = availabilityForVehicleStatus(input.status);
  await pool.query(
    `
      UPDATE vehicles
      SET status = $2::vehicle_status,
          availability = $3::vehicle_availability,
          updated_at = now()
      WHERE id = $1
    `,
    [vehicleId, input.status, availability],
  );
  const action =
    input.status === 'INACTIVE'
      ? 'VEHICLE_DEACTIVATED'
      : current.status === 'INACTIVE' && (input.status === 'ACTIVE' || input.status === 'AVAILABLE')
        ? 'VEHICLE_ACTIVATED'
        : 'VEHICLE_STATUS_CHANGED';
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action,
    entityType: 'vehicle',
    entityId: vehicleId,
    before: { status: current.status, availability: current.availability },
    after: { status: input.status, availability, note: input.note ?? null },
  });
  return loadVehicle(pool, actor, vehicleId);
}

export async function archiveVehicle(pool: Pool, actor: AuthContext, vehicleId: string) {
  const current = await loadVehicle(pool, actor, vehicleId);
  if (current.status !== 'INACTIVE' && current.status !== 'RETIRED') {
    throw unprocessable('Only inactive or retired vehicles can be archived');
  }
  await pool.query('UPDATE vehicles SET deleted_at = now(), updated_at = now() WHERE id = $1', [
    vehicleId,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'VEHICLE_ARCHIVED',
    entityType: 'vehicle',
    entityId: vehicleId,
    before: { reference: current.reference, status: current.status },
  });
  return { id: vehicleId, archived: true };
}

export async function addVehicleDocument(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
  input: DocumentInput,
) {
  const current = await loadVehicle(pool, actor, vehicleId);
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO vehicle_documents (
        vehicle_id, organization_id, document_type, document_number,
        issued_at, expires_at, status, storage_provider, storage_key, file_url,
        notes, uploaded_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `,
    [
      vehicleId,
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
  const id = created.rows[0]?.id;
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'VEHICLE_DOCUMENT_ADDED',
    entityType: 'vehicle_document',
    entityId: id,
    after: { vehicleId, documentType: input.documentType },
  });
  return loadVehicle(pool, actor, vehicleId);
}

export async function updateVehicleDocument(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
  documentId: string,
  input: Partial<DocumentInput>,
) {
  const current = await loadVehicle(pool, actor, vehicleId);
  const existing = current.documents.find((doc) => doc.id === documentId);
  if (!existing) {
    throw notFound('Document not found');
  }
  const updated = await pool.query(
    `
      UPDATE vehicle_documents
      SET document_type = COALESCE($3::vehicle_document_type, document_type),
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
      WHERE id = $1 AND vehicle_id = $2 AND deleted_at IS NULL
    `,
    [
      documentId,
      vehicleId,
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
    action: 'VEHICLE_DOCUMENT_UPDATED',
    entityType: 'vehicle_document',
    entityId: documentId,
  });
  return loadVehicle(pool, actor, vehicleId);
}

export async function removeVehicleDocument(
  pool: Pool,
  actor: AuthContext,
  vehicleId: string,
  documentId: string,
) {
  const current = await loadVehicle(pool, actor, vehicleId);
  const existing = current.documents.find((doc) => doc.id === documentId);
  if (!existing) {
    throw notFound('Document not found');
  }
  await pool.query(
    'UPDATE vehicle_documents SET deleted_at = now(), updated_at = now() WHERE id = $1 AND vehicle_id = $2',
    [documentId, vehicleId],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'VEHICLE_DOCUMENT_REMOVED',
    entityType: 'vehicle_document',
    entityId: documentId,
    before: { documentType: existing.documentType },
  });
  return loadVehicle(pool, actor, vehicleId);
}

export async function listVehicleActivity(pool: Pool, actor: AuthContext, vehicleId: string) {
  const current = await loadVehicle(pool, actor, vehicleId);
  const result = await pool.query(
    `
      SELECT action, entity_type, entity_id, before, after, created_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE (a.entity_id = $1 OR a.after->>'vehicleId' = $1)
      ORDER BY a.created_at DESC
      LIMIT 50
    `,
    [vehicleId],
  );
  return {
    vehicleId: current.id,
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

async function assertUniqueRegistration(
  pool: Pool | PoolClient,
  organizationId: string,
  normalized: string,
  excludeId?: string,
) {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id FROM vehicles
      WHERE organization_id = $1 AND registration_normalized = $2 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1
    `,
    [organizationId, normalized, excludeId ?? null],
  );
  if (result.rows[0]) {
    throw conflict('An active vehicle with this registration number already exists');
  }
}

function documentAlertSql(vehicleIdExpr: string, window: 'expired' | 'today' | '7' | '30') {
  const range =
    window === 'expired'
      ? 'd.expires_at < CURRENT_DATE'
      : window === 'today'
        ? 'd.expires_at = CURRENT_DATE'
        : window === '7'
          ? `d.expires_at >= CURRENT_DATE AND d.expires_at <= CURRENT_DATE + INTERVAL '7 days'`
          : `d.expires_at >= CURRENT_DATE AND d.expires_at <= CURRENT_DATE + INTERVAL '30 days'`;
  return `EXISTS (
    SELECT 1 FROM vehicle_documents d
    WHERE d.vehicle_id = ${vehicleIdExpr}
      AND d.deleted_at IS NULL
      AND d.expires_at IS NOT NULL
      AND d.status <> 'REVOKED'
      AND ${range}
  )`;
}
