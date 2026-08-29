import { SHIPMENT_STATUSES } from '@mizigox/shared';
import { z } from 'zod';
import { addressInputSchema } from '../customers/customer.schemas.js';

const addressRefSchema = z.union([
  z.object({ addressId: z.string().uuid() }),
  addressInputSchema.extend({
    streetLine1: z.string().trim().min(1).max(200),
    countryCode: z.string().trim().length(2).default('RW'),
  }),
]);

export const shipmentItemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(10000).default(1),
  weightKg: z.number().positive().max(100000).optional(),
  lengthCm: z.number().positive().max(2000).optional(),
  widthCm: z.number().positive().max(2000).optional(),
  heightCm: z.number().positive().max(2000).optional(),
});

export const createShipmentSchema = z.object({
  customerOrganizationId: z.string().uuid().optional(),
  cargoDescription: z.string().trim().min(1).max(500),
  cargoType: z.string().trim().max(80).optional(),
  weightKg: z.number().positive().max(100000).optional(),
  piecesCount: z.number().int().min(1).max(10000).optional(),
  specialInstructions: z.string().trim().max(2000).optional(),
  estimatedPickupAt: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid pickup date'),
  estimatedDeliveryAt: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Invalid delivery date'),
  origin: addressRefSchema,
  destination: addressRefSchema,
  items: z.array(shipmentItemSchema).max(50).optional(),
});

export const listShipmentsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().trim().max(500).optional(),
});
