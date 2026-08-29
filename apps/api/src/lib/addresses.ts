import type { AddressPayload, AddressType } from '@mizigox/shared';
import type { PoolClient } from 'pg';

export interface AddressInput {
  label?: string;
  addressType?: AddressType;
  countryCode: string;
  adminArea1?: string;
  adminArea2?: string;
  locality?: string;
  subLocality?: string;
  streetLine1?: string;
  streetLine2?: string;
  postalCode?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export function formatAddress(input: AddressInput) {
  return [
    input.streetLine1,
    input.streetLine2,
    input.landmark,
    input.subLocality,
    input.locality,
    input.adminArea2,
    input.adminArea1,
    input.countryCode,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(', ');
}

export async function insertAddress(
  client: PoolClient,
  organizationId: string,
  input: AddressInput,
) {
  if (input.isDefault) {
    await client.query(
      `
        UPDATE addresses
        SET is_default = false
        WHERE organization_id = $1 AND deleted_at IS NULL AND is_default = true
      `,
      [organizationId],
    );
  }

  const formatted = formatAddress(input) || input.countryCode;
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO addresses (
        organization_id, label, address_type, country_code, admin_area_1, admin_area_2,
        locality, sub_locality, street_line1, street_line2, postal_code,
        landmark, formatted_address, latitude, longitude, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `,
    [
      organizationId,
      input.label ?? null,
      input.addressType ?? 'OTHER',
      input.countryCode,
      input.adminArea1 ?? null,
      input.adminArea2 ?? null,
      input.locality ?? null,
      input.subLocality ?? null,
      input.streetLine1 ?? null,
      input.streetLine2 ?? null,
      input.postalCode ?? null,
      input.landmark ?? null,
      formatted,
      input.latitude ?? null,
      input.longitude ?? null,
      input.isDefault ?? false,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('Failed to create address');
  }
  return id;
}

export function mapAddress(row: {
  id: string;
  organization_id: string;
  label: string | null;
  address_type?: string | null;
  country_code: string;
  admin_area_1: string | null;
  admin_area_2: string | null;
  locality: string | null;
  sub_locality: string | null;
  street_line1: string | null;
  street_line2: string | null;
  postal_code: string | null;
  landmark: string | null;
  formatted_address: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  is_default?: boolean | null;
}): AddressPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    addressType: row.address_type ?? 'OTHER',
    countryCode: row.country_code,
    adminArea1: row.admin_area_1,
    adminArea2: row.admin_area_2,
    locality: row.locality,
    subLocality: row.sub_locality,
    streetLine1: row.street_line1,
    streetLine2: row.street_line2,
    postalCode: row.postal_code,
    landmark: row.landmark,
    formattedAddress: row.formatted_address,
    latitude: toNumber(row.latitude ?? null),
    longitude: toNumber(row.longitude ?? null),
    isDefault: row.is_default ?? false,
  };
}

export function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
