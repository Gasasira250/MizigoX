import {
  COUNTRIES,
  CURRENCIES,
  DIMENSION_UNITS,
  PACKAGE_TYPES,
  SHIPMENT_PRIORITIES,
  SHIPMENT_SORT_FIELDS,
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
  WEIGHT_UNITS,
} from '@mizigox/shared';
import { z } from 'zod';
import { addressFieldsSchema, e164PhoneSchema } from '../customers/customer.schemas.js';

const countryCodes = COUNTRIES.map((country) => country.code) as [string, ...string[]];
const currencyCodes = CURRENCIES.map((currency) => currency.code) as [string, ...string[]];

const optionalPhone = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  e164PhoneSchema.optional(),
);

const dateTimeSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid date and time');

export const shipmentStopSchema = addressFieldsSchema.extend({
  addressId: z.string().uuid().optional(),
  streetLine1: z.string().trim().max(200).optional(),
  countryCode: z.enum(countryCodes).default('RW'),
  contactName: z.string().trim().max(160).optional(),
  phoneE164: optionalPhone,
  instructions: z.string().trim().max(2000).optional(),
});

const addressRefSchema = z.union([
  z.object({ addressId: z.string().uuid() }),
  addressFieldsSchema.extend({
    streetLine1: z.string().trim().min(1).max(200),
    countryCode: z.string().trim().length(2).default('RW'),
  }),
]);

export const shipmentItemSchema = z.object({
  description: z.string().trim().min(1, 'Package description is required').max(200),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10000).default(1),
  weightKg: z.number().min(0, 'Weight cannot be negative').max(100000).optional(),
  weight: z.number().min(0).max(100000).optional(),
  weightUnit: z.enum(WEIGHT_UNITS).optional(),
  lengthCm: z.number().min(0, 'Length cannot be negative').max(2000).optional(),
  widthCm: z.number().min(0, 'Width cannot be negative').max(2000).optional(),
  heightCm: z.number().min(0, 'Height cannot be negative').max(2000).optional(),
  length: z.number().min(0).max(2000).optional(),
  width: z.number().min(0).max(2000).optional(),
  height: z.number().min(0).max(2000).optional(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional(),
  volumeM3: z.number().min(0).max(10000).optional(),
  packageType: z.enum(PACKAGE_TYPES).optional(),
  isFragile: z.boolean().optional(),
  specialHandling: z.string().trim().max(500).optional(),
});

export const createShipmentSchema = z
  .object({
    customerOrganizationId: z.string().uuid().optional(),
    shipmentType: z.enum(SHIPMENT_TYPES).default('STANDARD'),
    priority: z.enum(SHIPMENT_PRIORITIES).default('NORMAL'),
    description: z.string().trim().max(500).optional(),
    cargoDescription: z.string().trim().min(1, 'Cargo description is required').max(500),
    cargoType: z.string().trim().max(80).optional(),
    status: z.enum(['DRAFT', 'PENDING', 'CONFIRMED']).optional(),
    weightKg: z.number().min(0).max(100000).optional(),
    piecesCount: z.number().int().min(0).max(10000).optional(),
    weightUnit: z.enum(WEIGHT_UNITS).default('KG'),
    dimensionUnit: z.enum(DIMENSION_UNITS).default('CM'),
    declaredValue: z
      .number()
      .min(0, 'Declared value cannot be negative')
      .max(1_000_000_000)
      .optional(),
    declaredCurrencyCode: z.enum(currencyCodes).optional(),
    specialInstructions: z.string().trim().max(2000).optional(),
    estimatedPickupAt: dateTimeSchema,
    estimatedDeliveryAt: dateTimeSchema,
    origin: addressRefSchema.optional(),
    destination: addressRefSchema.optional(),
    pickup: shipmentStopSchema.optional(),
    delivery: shipmentStopSchema.optional(),
    items: z.array(shipmentItemSchema).max(50).optional(),
  })
  .refine((value) => Boolean(value.origin || value.pickup), {
    message: 'Pickup address is required',
    path: ['pickup'],
  })
  .refine((value) => Boolean(value.destination || value.delivery), {
    message: 'Delivery address is required',
    path: ['delivery'],
  });

export const updateShipmentSchema = z.object({
  shipmentType: z.enum(SHIPMENT_TYPES).optional(),
  priority: z.enum(SHIPMENT_PRIORITIES).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  cargoDescription: z.string().trim().min(1).max(500).optional(),
  cargoType: z.string().trim().max(80).nullable().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).optional(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional(),
  declaredValue: z.number().min(0).max(1_000_000_000).nullable().optional(),
  declaredCurrencyCode: z.enum(currencyCodes).nullable().optional(),
  specialInstructions: z.string().trim().max(2000).nullable().optional(),
  estimatedPickupAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid pickup date'),
  estimatedDeliveryAt: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid delivery date'),
  pickup: shipmentStopSchema.optional(),
  delivery: shipmentStopSchema.optional(),
  origin: addressRefSchema.optional(),
  destination: addressRefSchema.optional(),
  items: z.array(shipmentItemSchema).max(50).optional(),
});

export const listShipmentsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  priority: z.enum(SHIPMENT_PRIORITIES).optional(),
  from: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid from date'),
  to: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Enter a valid to date'),
  sort: z.enum(SHIPMENT_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
  note: z.string().trim().max(500).optional(),
  location: z.string().trim().max(200).optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
});

export const shipmentIdParamSchema = z.object({
  shipmentId: z.string().uuid('Shipment id must be a valid UUID'),
});
