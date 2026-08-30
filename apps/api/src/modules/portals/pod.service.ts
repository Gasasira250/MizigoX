import type { PodStatus, ProofOfDeliveryPayload, ShipmentStatus } from '@mizigox/shared';
import { canTransitionShipment } from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import { getLinkedDriver } from '../../lib/linked-driver.js';
import { getFileStorage, parseDataUrl } from '../../lib/storage.js';
import type { AuthContext } from '../auth/auth.types.js';
import { loadShipment, updateShipmentStatus } from '../shipments/shipment.service.js';
import type { z } from 'zod';
import type { submitPodSchema } from './portals.schemas.js';

type SubmitPodInput = z.infer<typeof submitPodSchema>;

const DELIVERABLE: ShipmentStatus[] = [
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_DESTINATION',
  'OUT_FOR_DELIVERY',
];

export async function getProofOfDelivery(pool: Pool, actor: AuthContext, shipmentId: string) {
  await assertCanReadShipment(pool, actor, shipmentId);
  const result = await pool.query(
    podSelect() + ` WHERE p.shipment_id = $1 AND p.deleted_at IS NULL`,
    [shipmentId],
  );
  if (!result.rows[0]) {
    throw notFound('Proof of delivery not found');
  }
  return mapPod(result.rows[0]);
}

export async function submitProofOfDelivery(
  pool: Pool,
  actor: AuthContext,
  input: SubmitPodInput,
): Promise<ProofOfDeliveryPayload> {
  const shipment = await loadShipment(pool, actor, input.shipmentId);
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot submit proof of delivery');
  }
  const driver = await getLinkedDriver(pool, actor);
  if (actor.role === 'DRIVER') {
    await assertDriverOwnsShipment(pool, driver!.id, input.shipmentId);
  }
  if (!DELIVERABLE.includes(shipment.status)) {
    throw unprocessable('This shipment is not ready for proof of delivery');
  }
  if (shipment.status === 'DELIVERED') {
    throw conflict('This shipment already has a completed delivery');
  }

  const existing = await pool.query<{ id: string; status: string }>(
    `SELECT id, status::text AS status FROM proofs_of_delivery WHERE shipment_id = $1 AND deleted_at IS NULL`,
    [input.shipmentId],
  );
  if (existing.rows[0] && existing.rows[0].status !== 'REJECTED') {
    throw conflict('Proof of delivery has already been submitted for this shipment');
  }

  const assignment = await pool.query<{
    route_id: string;
    stop_id: string | null;
    driver_id: string | null;
  }>(
    `
      SELECT r.id AS route_id, rs_stop.id AS stop_id, r.driver_id
      FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      LEFT JOIN route_stops rs_stop
        ON rs_stop.route_id = r.id AND rs_stop.shipment_id = rs.shipment_id
        AND rs_stop.stop_type = 'DELIVERY' AND rs_stop.deleted_at IS NULL
      WHERE rs.shipment_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.updated_at DESC
      LIMIT 1
    `,
    [input.shipmentId],
  );

  const client = await pool.connect();
  let podId: string;
  try {
    await client.query('BEGIN');
    const signatureId = input.signatureDataUrl
      ? await storeAttachment(
          client,
          actor,
          shipment.operatorOrganizationId,
          input.signatureDataUrl,
          'signature.png',
        )
      : null;
    const evidenceId = input.evidenceDataUrl
      ? await storeAttachment(
          client,
          actor,
          shipment.operatorOrganizationId,
          input.evidenceDataUrl,
          input.evidenceFilename ?? 'evidence',
        )
      : null;

    if (existing.rows[0]) {
      await client.query(`UPDATE proofs_of_delivery SET deleted_at = now() WHERE id = $1`, [
        existing.rows[0].id,
      ]);
    }

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO proofs_of_delivery (
          organization_id, shipment_id, route_id, stop_id, driver_id, submitted_by_user_id,
          recipient_name, recipient_phone_e164, notes, signature_storage_object_id,
          evidence_storage_object_id, latitude, longitude, captured_at, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'SUBMITTED')
        RETURNING id
      `,
      [
        shipment.operatorOrganizationId,
        input.shipmentId,
        input.routeId ?? assignment.rows[0]?.route_id ?? null,
        input.stopId ?? assignment.rows[0]?.stop_id ?? null,
        driver?.id ?? assignment.rows[0]?.driver_id ?? null,
        actor.userId,
        input.recipientName,
        input.recipientPhone ?? null,
        input.notes ?? null,
        signatureId,
        evidenceId,
        input.latitude ?? null,
        input.longitude ?? null,
        input.capturedAt ?? new Date().toISOString(),
      ],
    );
    podId = inserted.rows[0]!.id;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const path = deliveryPath(shipment.status);
  let currentStatus: ShipmentStatus = shipment.status;
  for (const next of path) {
    if (!canTransitionShipment(currentStatus, next)) {
      throw new AppError(
        422,
        'SHIPMENT_INVALID_TRANSITION',
        `Cannot move a ${currentStatus} shipment to ${next} after proof of delivery.`,
      );
    }
    const updated = await updateShipmentStatus(
      pool,
      actor,
      input.shipmentId,
      {
        status: next,
        note:
          next === 'DELIVERED'
            ? `Delivered to ${input.recipientName}`
            : `Updated by proof of delivery (${next})`,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      { viaPod: true },
    );
    currentStatus = updated.status;
  }

  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: shipment.operatorOrganizationId,
    action: 'POD_SUBMITTED',
    entityType: 'proof_of_delivery',
    entityId: podId,
    after: { shipmentId: input.shipmentId, recipientName: input.recipientName },
  });
  return getProofOfDelivery(pool, actor, input.shipmentId);
}

export async function verifyProofOfDelivery(
  pool: Pool,
  actor: AuthContext,
  podId: string,
  input: { status: 'VERIFIED' | 'REJECTED'; reason?: string },
) {
  if (actor.role === 'DRIVER' || actor.orgType === 'CUSTOMER') {
    throw forbidden('You cannot verify proof of delivery');
  }
  const current = await pool.query(podSelect() + ` WHERE p.id = $1 AND p.deleted_at IS NULL`, [
    podId,
  ]);
  if (!current.rows[0]) {
    throw notFound('Proof of delivery not found');
  }
  const pod = mapPod(current.rows[0]);
  if (actor.orgType === 'OPERATOR' && pod.organizationId !== actor.orgId) {
    throw forbidden('You do not have access to this proof of delivery');
  }
  await pool.query(
    `
      UPDATE proofs_of_delivery
      SET status = $2::pod_status,
          verified_at = CASE WHEN $2::text = 'VERIFIED' THEN now() ELSE verified_at END,
          verified_by_user_id = $3,
          rejection_reason = $4
      WHERE id = $1
    `,
    [podId, input.status, actor.userId, input.reason ?? null],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: pod.organizationId,
    action: input.status === 'VERIFIED' ? 'POD_VERIFIED' : 'POD_REJECTED',
    entityType: 'proof_of_delivery',
    entityId: podId,
  });
  return getProofOfDelivery(pool, actor, pod.shipmentId);
}

async function storeAttachment(
  client: PoolClient,
  actor: AuthContext,
  organizationId: string,
  dataUrl: string,
  filename: string,
) {
  const parsed = parseDataUrl(dataUrl);
  const stored = await getFileStorage().put({
    organizationId,
    buffer: parsed.buffer,
    contentType: parsed.contentType,
    filename,
  });
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO storage_objects (
        organization_id, provider, storage_key, content_type, byte_size,
        original_filename, checksum_sha256, created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `,
    [
      organizationId,
      stored.provider,
      stored.storageKey,
      stored.contentType,
      stored.byteSize,
      stored.originalFilename,
      stored.checksumSha256,
      actor.userId,
    ],
  );
  return inserted.rows[0]!.id;
}

async function assertCanReadShipment(pool: Pool, actor: AuthContext, shipmentId: string) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot view internal proof of delivery records');
  }
  await loadShipment(pool, actor, shipmentId);
}

async function assertDriverOwnsShipment(pool: Pool, driverId: string, shipmentId: string) {
  const assigned = await pool.query(
    `
      SELECT r.id
      FROM route_shipments rs
      JOIN routes r ON r.id = rs.route_id
      WHERE rs.shipment_id = $1 AND r.driver_id = $2 AND r.deleted_at IS NULL
      LIMIT 1
    `,
    [shipmentId, driverId],
  );
  if (!assigned.rows[0]) {
    throw forbidden('You are not assigned to this shipment');
  }
}

function deliveryPath(from: ShipmentStatus): ShipmentStatus[] {
  switch (from) {
    case 'OUT_FOR_DELIVERY':
      return ['DELIVERED'];
    case 'AT_DESTINATION':
      return ['OUT_FOR_DELIVERY', 'DELIVERED'];
    case 'IN_TRANSIT':
      return ['OUT_FOR_DELIVERY', 'DELIVERED'];
    case 'PICKED_UP':
      return ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    default:
      throw unprocessable('This shipment is not ready for proof of delivery');
  }
}

function podSelect() {
  return `
    SELECT p.id, p.organization_id, p.shipment_id, s.reference AS shipment_reference,
           p.route_id, p.stop_id, p.driver_id,
           NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
           p.recipient_name, p.recipient_phone_e164, p.notes,
           sig.storage_key AS signature_storage_key,
           ev.storage_key AS evidence_storage_key,
           p.latitude, p.longitude, p.captured_at, p.status::text AS status,
           p.verified_at, p.verified_by_user_id, p.rejection_reason, p.created_at, p.updated_at
    FROM proofs_of_delivery p
    JOIN shipments s ON s.id = p.shipment_id
    LEFT JOIN drivers d ON d.id = p.driver_id
    LEFT JOIN storage_objects sig ON sig.id = p.signature_storage_object_id
    LEFT JOIN storage_objects ev ON ev.id = p.evidence_storage_object_id
  `;
}

function mapPod(row: Record<string, unknown>): ProofOfDeliveryPayload {
  return {
    id: String(row.id),
    shipmentId: String(row.shipment_id),
    shipmentReference: String(row.shipment_reference),
    organizationId: String(row.organization_id),
    routeId: (row.route_id as string | null) ?? null,
    stopId: (row.stop_id as string | null) ?? null,
    driverId: (row.driver_id as string | null) ?? null,
    driverName: (row.driver_name as string | null) ?? null,
    recipientName: String(row.recipient_name),
    recipientPhone: (row.recipient_phone_e164 as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    signatureStorageKey: null,
    evidenceStorageKey: null,
    hasSignature: Boolean(row.signature_storage_key),
    hasEvidence: Boolean(row.evidence_storage_key),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    capturedAt: row.captured_at ? new Date(row.captured_at as string).toISOString() : null,
    status: String(row.status) as PodStatus,
    verifiedAt: row.verified_at ? new Date(row.verified_at as string).toISOString() : null,
    verifiedByUserId: (row.verified_by_user_id as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
