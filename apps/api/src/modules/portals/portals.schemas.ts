import {
  ORGANIZATION_STATUSES,
  POD_STATUSES,
  ROLE_CODES,
  SEARCH_RESOURCE_TYPES,
  USER_STATUSES,
} from '@mizigox/shared';
import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  types: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [...SEARCH_RESOURCE_TYPES],
    )
    .pipe(z.array(z.enum(SEARCH_RESOURCE_TYPES))),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phoneE164: z.string().trim().max(20).nullable().optional(),
  preferredLanguage: z.string().trim().min(2).max(8).optional(),
  preferredTimezone: z.string().trim().min(1).max(80).optional(),
  displayPreferences: z
    .object({
      density: z.enum(['comfortable', 'compact']).optional(),
      language: z.string().trim().min(2).max(8).optional(),
      timezone: z.string().trim().min(1).max(80).optional(),
    })
    .optional(),
});

export const updateOrganizationSettingsSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  taxId: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phoneE164: z.string().trim().max(20).nullable().optional(),
  countryCode: z.string().trim().length(2).optional(),
  defaultCurrencyCode: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  logoStorageKey: z.string().trim().max(400).nullable().optional(),
  businessDetails: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(ORGANIZATION_STATUSES).optional(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLE_CODES).optional(),
  organizationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid(),
});

export const organizationIdParamSchema = z.object({
  organizationId: z.string().uuid(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLE_CODES),
  organizationId: z.string().uuid().optional(),
});

export const listAuditQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  organizationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const submitPodSchema = z.object({
  shipmentId: z.string().uuid(),
  routeId: z.string().uuid().optional(),
  stopId: z.string().uuid().optional(),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
  signatureDataUrl: z.string().min(20).max(2_000_000).optional(),
  evidenceDataUrl: z.string().min(20).max(2_000_000).optional(),
  evidenceFilename: z.string().trim().max(180).optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
});

export const verifyPodSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  reason: z.string().trim().max(500).optional(),
});

export const podIdParamSchema = z.object({
  podId: z.string().uuid(),
});

export const shipmentIdParamSchema = z.object({
  shipmentId: z.string().uuid(),
});

export const routeIdParamSchema = z.object({
  routeId: z.string().uuid(),
});

export const stopIdParamSchema = z.object({
  stopId: z.string().uuid(),
});

export const driverNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export { POD_STATUSES };
