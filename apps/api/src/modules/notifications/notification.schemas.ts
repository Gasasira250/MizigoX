import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_DIGEST_MODES,
  NOTIFICATION_TYPES,
  PUSH_PLATFORMS,
} from '@mizigox/shared';
import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid(),
});

export const deliveryIdParamSchema = z.object({
  deliveryId: z.string().uuid(),
});

export const templateIdParamSchema = z.object({
  templateId: z.string().uuid(),
});

export const deviceIdParamSchema = z.object({
  deviceId: z.string().uuid(),
});

export const listDeliveriesQuerySchema = z.object({
  status: z.enum(NOTIFICATION_DELIVERY_STATUSES).optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: z.enum(NOTIFICATION_CATEGORIES),
        channel: z.enum(NOTIFICATION_CHANNELS),
        enabled: z.boolean(),
        digest: z.enum(NOTIFICATION_DIGEST_MODES).optional(),
      }),
    )
    .min(1)
    .max(32),
});

export const updateTemplateSchema = z.object({
  subject: z.string().trim().max(240).nullable().optional(),
  body: z.string().trim().min(1).max(4000).optional(),
  active: z.boolean().optional(),
});

export const registerDeviceSchema = z.object({
  platform: z.enum(PUSH_PLATFORMS),
  token: z.string().trim().min(16).max(4096),
  deviceName: z.string().trim().max(120).optional(),
});
