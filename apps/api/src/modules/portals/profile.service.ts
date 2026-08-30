import type {
  DisplayPreferences,
  OrganizationSettingsPayload,
  UserProfilePayload,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { z } from 'zod';
import type { updateOrganizationSettingsSchema, updateProfileSchema } from './portals.schemas.js';

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
type UpdateOrgInput = z.infer<typeof updateOrganizationSettingsSchema>;

export async function getProfile(pool: Pool, actor: AuthContext): Promise<UserProfilePayload> {
  const result = await pool.query(
    `
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone_e164, u.status::text AS status,
             u.preferred_language, u.preferred_timezone, u.display_preferences,
             o.id AS organization_id, o.name AS organization_name, o.type::text AS organization_type,
             o.country_code, o.default_currency_code, o.status::text AS organization_status
      FROM users u
      JOIN organizations o ON o.id = $2
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `,
    [actor.userId, actor.orgId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('User not found');
  }
  return mapProfile(row, actor);
}

export async function updateProfile(
  pool: Pool,
  actor: AuthContext,
  input: UpdateProfileInput,
): Promise<UserProfilePayload> {
  const current = await getProfile(pool, actor);
  const nextPrefs = {
    density: input.displayPreferences?.density ?? current.displayPreferences.density,
    language:
      input.displayPreferences?.language ??
      input.preferredLanguage ??
      current.displayPreferences.language,
    timezone:
      input.displayPreferences?.timezone ??
      input.preferredTimezone ??
      current.displayPreferences.timezone,
  };
  try {
    await pool.query(
      `
        UPDATE users
        SET first_name = COALESCE($2, first_name),
            last_name = COALESCE($3, last_name),
            phone_e164 = CASE WHEN $4::boolean THEN $5 ELSE phone_e164 END,
            preferred_language = COALESCE($6, preferred_language),
            preferred_timezone = COALESCE($7, preferred_timezone),
            display_preferences = $8::jsonb
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [
        actor.userId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.phoneE164 !== undefined,
        input.phoneE164 ?? null,
        input.preferredLanguage ?? null,
        input.preferredTimezone ?? null,
        JSON.stringify(nextPrefs),
      ],
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('That phone number is already in use');
    }
    throw error;
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: actor.orgId,
    action: 'USER_PROFILE_UPDATED',
    entityType: 'user',
    entityId: actor.userId,
  });
  return getProfile(pool, actor);
}

export async function getOrganizationSettings(
  pool: Pool,
  actor: AuthContext,
  organizationId: string,
): Promise<OrganizationSettingsPayload> {
  assertCanAccessOrganization(actor, organizationId);
  const result = await pool.query(
    `
      SELECT id, type::text AS type, name, legal_name, registration_number, tax_id, email, phone_e164,
             country_code, default_currency_code, status::text AS status, settings,
             created_at, updated_at
      FROM organizations
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [organizationId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Organization not found');
  }
  return mapOrganization(row);
}

export async function updateOrganizationSettings(
  pool: Pool,
  actor: AuthContext,
  organizationId: string,
  input: UpdateOrgInput,
): Promise<OrganizationSettingsPayload> {
  assertCanAccessOrganization(actor, organizationId);
  if (input.status && actor.orgType !== 'PLATFORM') {
    throw forbidden('Only platform administrators can change organization status');
  }
  const current = await getOrganizationSettings(pool, actor, organizationId);
  const nextSettings = {
    ...(current.settings ?? {}),
    timezone:
      input.timezone ?? (current.settings.timezone as string | undefined) ?? current.timezone,
    address: input.address === undefined ? current.address : input.address,
    logoStorageKey:
      input.logoStorageKey === undefined ? current.logoStorageKey : input.logoStorageKey,
    businessDetails:
      input.businessDetails === undefined ? current.businessDetails : input.businessDetails,
  };
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
          default_currency_code = COALESCE($14, default_currency_code),
          status = COALESCE($15::organization_status, status),
          settings = $16::jsonb
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [
      organizationId,
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
      input.defaultCurrencyCode ?? null,
      input.status ?? null,
      JSON.stringify(nextSettings),
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId,
    action: 'ORGANIZATION_SETTINGS_UPDATED',
    entityType: 'organization',
    entityId: organizationId,
  });
  return getOrganizationSettings(pool, actor, organizationId);
}

function assertCanAccessOrganization(actor: AuthContext, organizationId: string) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgId !== organizationId) {
    throw forbidden('You do not have access to this organization');
  }
}

function mapProfile(row: Record<string, unknown>, actor: AuthContext): UserProfilePayload {
  const prefs = (row.display_preferences ?? {}) as Partial<DisplayPreferences>;
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phoneE164: (row.phone_e164 as string | null) ?? null,
    role: actor.role,
    status: String(row.status),
    preferredLanguage: String(row.preferred_language ?? 'en'),
    preferredTimezone: String(row.preferred_timezone ?? 'Africa/Kigali'),
    displayPreferences: {
      density: prefs.density === 'compact' ? 'compact' : 'comfortable',
      language: prefs.language ?? String(row.preferred_language ?? 'en'),
      timezone: prefs.timezone ?? String(row.preferred_timezone ?? 'Africa/Kigali'),
    },
    organization: {
      id: String(row.organization_id),
      name: String(row.organization_name),
      type: String(row.organization_type),
      countryCode: String(row.country_code),
      defaultCurrencyCode: String(row.default_currency_code),
      status: String(row.organization_status),
    },
    permissions: actor.permissions,
  };
}

function mapOrganization(row: Record<string, unknown>): OrganizationSettingsPayload {
  const settings = (row.settings ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    type: String(row.type),
    name: String(row.name),
    legalName: (row.legal_name as string | null) ?? null,
    registrationNumber: (row.registration_number as string | null) ?? null,
    taxId: (row.tax_id as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phoneE164: (row.phone_e164 as string | null) ?? null,
    countryCode: String(row.country_code),
    defaultCurrencyCode: String(row.default_currency_code),
    status: String(row.status),
    timezone: typeof settings.timezone === 'string' ? settings.timezone : 'Africa/Kigali',
    address: typeof settings.address === 'string' ? settings.address : null,
    logoStorageKey: typeof settings.logoStorageKey === 'string' ? settings.logoStorageKey : null,
    businessDetails: typeof settings.businessDetails === 'string' ? settings.businessDetails : null,
    settings,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === '23505',
  );
}
