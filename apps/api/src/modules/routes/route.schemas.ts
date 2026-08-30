import {
  ROUTE_SORT_FIELDS,
  ROUTE_STATUSES,
  ROUTE_STOP_STATUSES,
  ROUTE_STOP_TYPES,
  ROUTE_TYPES,
} from '@mizigox/shared';
import { z } from 'zod';
import { e164PhoneSchema } from '../customers/customer.schemas.js';

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalPhone = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  e164PhoneSchema.optional(),
);

const dateTimeRequired = z
  .string()
  .trim()
  .datetime({ offset: true, message: 'Enter a valid date and time' });
const dateTime = dateTimeRequired.optional();

export const routeStopInputSchema = z.object({
  shipmentId: z.string().uuid().optional(),
  stopType: z.enum(ROUTE_STOP_TYPES),
  status: z.enum(ROUTE_STOP_STATUSES).optional(),
  addressId: z.string().uuid().optional(),
  formattedAddress: optionalText(500),
  contactName: optionalText(120),
  contactPhone: optionalPhone,
  plannedArrivalAt: dateTime,
  plannedDepartureAt: dateTime,
  actualArrivalAt: dateTime,
  actualDepartureAt: dateTime,
  instructions: optionalText(1000),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notes: optionalText(1000),
  countryCode: z.string().trim().length(2).optional(),
  streetLine1: optionalText(200),
  adminArea1: optionalText(80),
  adminArea2: optionalText(80),
  locality: optionalText(80),
});

export const createRouteSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    routeType: z.enum(ROUTE_TYPES).default('STANDARD'),
    shipmentIds: z.array(z.string().uuid()).default([]),
    vehicleId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    plannedDepartureAt: dateTime,
    plannedArrivalAt: dateTime,
    distanceKm: z.number().min(0).max(100_000).optional(),
    estimatedDurationMinutes: z.number().int().min(0).max(100_000).optional(),
    notes: optionalText(2000),
    status: z.enum(['DRAFT', 'PLANNED']).optional(),
    stops: z.array(routeStopInputSchema).optional(),
  })
  .refine(
    (value) =>
      !value.plannedDepartureAt ||
      !value.plannedArrivalAt ||
      value.plannedArrivalAt >= value.plannedDepartureAt,
    {
      message: 'Planned arrival cannot be before planned departure',
      path: ['plannedArrivalAt'],
    },
  );

export const updateRouteSchema = z
  .object({
    routeType: z.enum(ROUTE_TYPES).optional(),
    vehicleId: z.union([z.string().uuid(), z.null()]).optional(),
    driverId: z.union([z.string().uuid(), z.null()]).optional(),
    plannedDepartureAt: z.union([dateTimeRequired, z.null()]).optional(),
    plannedArrivalAt: z.union([dateTimeRequired, z.null()]).optional(),
    distanceKm: z.union([z.number().min(0).max(100_000), z.null()]).optional(),
    estimatedDurationMinutes: z.union([z.number().int().min(0).max(100_000), z.null()]).optional(),
    notes: z.union([z.string().trim().max(2000), z.null()]).optional(),
  })
  .refine(
    (value) => {
      if (!value.plannedDepartureAt || !value.plannedArrivalAt) return true;
      if (value.plannedDepartureAt === null || value.plannedArrivalAt === null) return true;
      return value.plannedArrivalAt >= value.plannedDepartureAt;
    },
    {
      message: 'Planned arrival cannot be before planned departure',
      path: ['plannedArrivalAt'],
    },
  );

export const listRoutesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(ROUTE_STATUSES).optional(),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(ROUTE_SORT_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateRouteStatusSchema = z.object({
  status: z.enum(ROUTE_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const routeIdParamSchema = z.object({
  routeId: z.string().uuid('Route id must be a valid UUID'),
});

export const routeStopIdParamSchema = z.object({
  routeId: z.string().uuid(),
  stopId: z.string().uuid(),
});

export const routeShipmentParamSchema = z.object({
  routeId: z.string().uuid(),
  shipmentId: z.string().uuid(),
});

export const addRouteShipmentSchema = z.object({
  shipmentId: z.string().uuid(),
});

export const reorderStopsSchema = z.object({
  stopIds: z.array(z.string().uuid()).min(1),
});
