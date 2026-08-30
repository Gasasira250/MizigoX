import {
  DOCUMENT_ALERT_WINDOWS,
  DRIVER_AVAILABILITIES,
  DRIVER_DOCUMENT_TYPES,
  DRIVER_SORT_FIELDS,
  DRIVER_STATUSES,
  FLEET_DOCUMENT_STATUSES,
} from '@mizigox/shared';
import { z } from 'zod';
import { e164PhoneSchema } from '../customers/customer.schemas.js';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email('Enter a valid email address').max(255).optional(),
);

const optionalPhone = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  e164PhoneSchema.optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().url('Enter a valid document URL').max(500).optional(),
);

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD')
  .optional();

function licenseDatesValid(value: { licenseIssuedAt?: string; licenseExpiresAt?: string }) {
  return (
    !value.licenseIssuedAt ||
    !value.licenseExpiresAt ||
    value.licenseExpiresAt >= value.licenseIssuedAt
  );
}

function adultDateOfBirth(value: { dateOfBirth?: string }) {
  if (!value.dateOfBirth) {
    return true;
  }
  const birth = new Date(`${value.dateOfBirth}T00:00:00.000Z`);
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 18);
  return birth <= cutoff;
}

export const driverFieldsSchema = z.object({
  organizationId: z.string().uuid().optional(),
  userId: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().uuid().nullable().optional(),
  ),
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  phoneE164: e164PhoneSchema,
  email: optionalEmail,
  dateOfBirth: dateOnly,
  licenseNumber: optionalText(80),
  licenseCategory: optionalText(40),
  licenseIssuedAt: dateOnly,
  licenseExpiresAt: dateOnly,
  nationalityCountryCode: z.string().trim().length(2).optional(),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalPhone,
  status: z.enum(['ACTIVE', 'AVAILABLE', 'OFF_DUTY', 'INACTIVE']).optional(),
  notes: optionalText(2000),
});

export const createDriverSchema = driverFieldsSchema
  .refine(licenseDatesValid, {
    message: 'License expiry cannot be before the issue date',
    path: ['licenseExpiresAt'],
  })
  .refine(adultDateOfBirth, {
    message: 'Driver must be at least 18 years old',
    path: ['dateOfBirth'],
  });

export const updateDriverSchema = driverFieldsSchema
  .omit({ organizationId: true, status: true })
  .partial()
  .refine(licenseDatesValid, {
    message: 'License expiry cannot be before the issue date',
    path: ['licenseExpiresAt'],
  })
  .refine(adultDateOfBirth, {
    message: 'Driver must be at least 18 years old',
    path: ['dateOfBirth'],
  });

export const listDriversQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(DRIVER_STATUSES).optional(),
  availability: z.enum(DRIVER_AVAILABILITIES).optional(),
  licenseExpiry: z.enum(DOCUMENT_ALERT_WINDOWS).optional(),
  sort: z.enum(DRIVER_SORT_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateDriverStatusSchema = z.object({
  status: z.enum(DRIVER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const driverIdParamSchema = z.object({
  driverId: z.string().uuid('Driver id must be a valid UUID'),
});

export const driverDocumentFieldsSchema = z.object({
  documentType: z.enum(DRIVER_DOCUMENT_TYPES),
  documentNumber: optionalText(80),
  issuedAt: dateOnly,
  expiresAt: dateOnly,
  status: z.enum(FLEET_DOCUMENT_STATUSES).optional(),
  storageKey: optionalText(255),
  fileUrl: optionalUrl,
  notes: optionalText(1000),
});

export const driverDocumentSchema = driverDocumentFieldsSchema.refine(
  (value) => !value.issuedAt || !value.expiresAt || value.expiresAt >= value.issuedAt,
  {
    message: 'Expiry date cannot be before the issue date',
    path: ['expiresAt'],
  },
);

export const driverDocumentIdParamSchema = z.object({
  driverId: z.string().uuid(),
  documentId: z.string().uuid(),
});
