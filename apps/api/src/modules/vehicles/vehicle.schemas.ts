import {
  DOCUMENT_ALERT_WINDOWS,
  FUEL_TYPES,
  OWNERSHIP_TYPES,
  PAYLOAD_UNITS,
  VEHICLE_AVAILABILITIES,
  VEHICLE_DOCUMENT_TYPES,
  VEHICLE_SORT_FIELDS,
  VEHICLE_STATUSES,
  VEHICLE_TYPE_CODES,
  FLEET_DOCUMENT_STATUSES,
} from '@mizigox/shared';
import { z } from 'zod';

const currentYear = new Date().getUTCFullYear();

export const registrationSchema = z
  .string()
  .trim()
  .min(3, 'Registration number is required')
  .max(20)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9\s-]{1,18}[A-Za-z0-9]$/,
    'Enter a valid registration or plate number',
  );

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
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

export const createVehicleSchema = z.object({
  organizationId: z.string().uuid().optional(),
  vehicleType: z.enum(VEHICLE_TYPE_CODES),
  registrationNumber: registrationSchema,
  make: optionalText(80),
  model: optionalText(80),
  year: z
    .number()
    .int()
    .min(1980)
    .max(currentYear + 1)
    .optional(),
  color: optionalText(40),
  vin: optionalText(40),
  engineNumber: optionalText(40),
  payloadCapacity: z.number().min(0, 'Capacity cannot be negative').max(1_000_000).optional(),
  payloadUnit: z.enum(PAYLOAD_UNITS).default('KG'),
  lengthM: z.number().min(0).max(50).optional(),
  widthM: z.number().min(0).max(10).optional(),
  heightM: z.number().min(0).max(10).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  ownershipType: z.enum(OWNERSHIP_TYPES).default('OWNED'),
  status: z.enum(['ACTIVE', 'AVAILABLE', 'INACTIVE']).optional(),
  notes: optionalText(2000),
});

export const updateVehicleSchema = createVehicleSchema
  .omit({ organizationId: true, status: true })
  .partial();

export const listVehiclesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
  availability: z.enum(VEHICLE_AVAILABILITIES).optional(),
  vehicleType: z.enum(VEHICLE_TYPE_CODES).optional(),
  documentAlert: z.enum(DOCUMENT_ALERT_WINDOWS).optional(),
  sort: z.enum(VEHICLE_SORT_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateVehicleStatusSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const vehicleIdParamSchema = z.object({
  vehicleId: z.string().uuid('Vehicle id must be a valid UUID'),
});

export const vehicleDocumentFieldsSchema = z.object({
  documentType: z.enum(VEHICLE_DOCUMENT_TYPES),
  documentNumber: optionalText(80),
  issuedAt: dateOnly,
  expiresAt: dateOnly,
  status: z.enum(FLEET_DOCUMENT_STATUSES).optional(),
  storageKey: optionalText(255),
  fileUrl: optionalUrl,
  notes: optionalText(1000),
});

export const vehicleDocumentSchema = vehicleDocumentFieldsSchema.refine(
  (value) => !value.issuedAt || !value.expiresAt || value.expiresAt >= value.issuedAt,
  {
    message: 'Expiry date cannot be before the issue date',
    path: ['expiresAt'],
  },
);

export const vehicleDocumentIdParamSchema = z.object({
  vehicleId: z.string().uuid(),
  documentId: z.string().uuid(),
});
