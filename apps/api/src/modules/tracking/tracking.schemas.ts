import { LOCATION_SOURCES } from '@mizigox/shared';
import { z } from 'zod';

export const submitLocationSchema = z.object({
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180),
  accuracyMeters: z.number().min(0).max(50_000).optional(),
  speedKph: z.number().min(0).max(400).optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  altitudeMeters: z.number().min(-500).max(10_000).optional(),
  batteryPercent: z.number().min(0).max(100).optional(),
  deviceTimestamp: z.string().datetime({ offset: true }).optional(),
  source: z.enum(LOCATION_SOURCES).optional(),
  vehicleId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  deviceLabel: z.string().trim().max(120).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const listLocationsQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const liveDashboardQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  status: z.string().trim().max(40).optional(),
  freshness: z.enum(['LIVE', 'RECENT', 'STALE', 'OFFLINE']).optional(),
});

export const trackingEventsQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  routeId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const publicTokenParamSchema = z.object({
  token: z
    .string()
    .trim()
    .min(40, 'Tracking token is invalid')
    .max(128)
    .regex(/^mxt_[A-Za-z0-9_-]+$/, 'Tracking token is invalid'),
});

export const vehicleIdParamSchema = z.object({
  vehicleId: z.string().uuid(),
});

export const routeIdParamSchema = z.object({
  routeId: z.string().uuid(),
});

export const shipmentIdParamSchema = z.object({
  shipmentId: z.string().uuid(),
});
