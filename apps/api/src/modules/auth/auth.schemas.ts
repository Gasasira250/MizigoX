import { ROLE_CODES } from '@mizigox/shared';
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export const createInviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(ROLE_CODES),
  organizationId: z.string().uuid().optional(),
});

export const registerSchema = z.object({
  token: z.string().min(20).max(256),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
