import {
  ADDRESS_TYPES,
  COUNTRIES,
  CUSTOMER_LIFECYCLE_STATUSES,
  CUSTOMER_SORT_FIELDS,
  CUSTOMER_TYPES,
  CONTACT_STATUSES,
} from '@mizigox/shared';
import { z } from 'zod';

const countryCodes = COUNTRIES.map((country) => country.code) as [string, ...string[]];

export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+[1-9]\d{6,14}$/,
    'Enter a valid international phone number in E.164 format, for example +250788123456',
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().email('Enter a valid email address').max(255).optional(),
);

const optionalPhone = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  e164PhoneSchema.optional(),
);

const optionalWebsite = z.preprocess((value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url('Enter a valid website URL').max(255).optional());

export const addressFieldsSchema = z.object({
  label: z.string().trim().max(80).optional(),
  addressType: z.enum(ADDRESS_TYPES).optional(),
  countryCode: z.enum(countryCodes).optional(),
  adminArea1: z.string().trim().max(120).optional(),
  adminArea2: z.string().trim().max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  subLocality: z.string().trim().max(120).optional(),
  streetLine1: z.string().trim().max(200).optional(),
  streetLine2: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(32).optional(),
  landmark: z.string().trim().max(200).optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  isDefault: z.boolean().optional(),
});

export const addressInputSchema = addressFieldsSchema
  .extend({
    countryCode: z.enum(countryCodes).default('RW'),
  })
  .refine((value) => value.latitude === undefined || value.longitude !== undefined, {
    message: 'Longitude is required when latitude is provided',
    path: ['longitude'],
  })
  .refine((value) => value.longitude === undefined || value.latitude !== undefined, {
    message: 'Latitude is required when longitude is provided',
    path: ['latitude'],
  });

export const updateAddressSchema = addressFieldsSchema.partial();

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(80),
  lastName: z.string().trim().min(1, 'Last name is required').max(80),
  email: optionalEmail,
  phoneE164: optionalPhone,
  jobTitle: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().optional(),
  status: z.enum(CONTACT_STATUSES).optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(160),
  legalName: z.string().trim().max(200).optional(),
  customerType: z.enum(CUSTOMER_TYPES).default('BUSINESS'),
  registrationNumber: z.string().trim().max(80).optional(),
  taxId: z.string().trim().max(80).optional(),
  email: optionalEmail,
  phoneE164: optionalPhone,
  website: optionalWebsite,
  countryCode: z.enum(countryCodes).default('RW'),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
  operatorOrganizationId: z.string().uuid().optional(),
  creditTermsDays: z.number().int().min(0).max(365).optional(),
  primaryContact: contactInputSchema.optional(),
  primaryAddress: addressInputSchema.optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(160).optional(),
  legalName: z.string().trim().max(200).nullable().optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  taxId: z.string().trim().max(80).nullable().optional(),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().email('Enter a valid email address').max(255).nullable().optional(),
  ),
  phoneE164: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    e164PhoneSchema.nullable().optional(),
  ),
  website: z.preprocess((value) => {
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      return null;
    }
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }, z.string().url('Enter a valid website URL').max(255).nullable().optional()),
  countryCode: z.enum(countryCodes).optional(),
  city: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  creditTermsDays: z.number().int().min(0).max(365).optional(),
  status: z.enum(CUSTOMER_LIFECYCLE_STATUSES).optional(),
});

export const customerIdParamSchema = z.object({
  customerId: z.string().uuid('Customer id must be a valid UUID'),
});

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(CUSTOMER_LIFECYCLE_STATUSES).optional(),
  countryCode: z.enum(countryCodes).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  sort: z.enum(CUSTOMER_SORT_FIELDS).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
