import { z } from 'zod';

export const addressInputSchema = z.object({
  label: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().length(2).default('RW'),
  adminArea1: z.string().trim().max(120).optional(),
  adminArea2: z.string().trim().max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  subLocality: z.string().trim().max(120).optional(),
  streetLine1: z.string().trim().max(200).optional(),
  streetLine2: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(32).optional(),
  landmark: z.string().trim().max(200).optional(),
  isDefault: z.boolean().optional(),
});

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255).optional(),
  phoneE164: z.string().trim().max(32).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(255).optional(),
  phoneE164: z.string().trim().max(32).optional(),
  countryCode: z.string().trim().length(2).default('RW'),
  operatorOrganizationId: z.string().uuid().optional(),
  creditTermsDays: z.number().int().min(0).max(365).optional(),
  primaryContact: contactInputSchema.optional(),
  primaryAddress: addressInputSchema.optional(),
});

export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
