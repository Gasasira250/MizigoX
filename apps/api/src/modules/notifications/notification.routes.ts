import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import {
  deliveryIdParamSchema,
  deviceIdParamSchema,
  listDeliveriesQuerySchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  registerDeviceSchema,
  templateIdParamSchema,
  updatePreferencesSchema,
  updateTemplateSchema,
} from './notification.schemas.js';
import {
  deactivateDeviceToken,
  getPreferences,
  listDeliveries,
  listDeviceTokens,
  listNotifications,
  listTemplates,
  markAllRead,
  markRead,
  markUnread,
  registerDeviceToken,
  retryNotificationDelivery,
  unreadCount,
  updatePreferences,
  updateTemplate,
} from './notification.service.js';
import { processDueDeliveries } from './notification.queue.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    const query = listNotificationsQuerySchema.parse(req.query);
    const result = await listNotifications(getPool(), req.auth!, query);
    sendSuccess(res, result.notifications, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

notificationRouter.get(
  '/unread-count',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await unreadCount(getPool(), req.auth!));
  }),
);

notificationRouter.post(
  '/read-all',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'notifications-read-all' }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await markAllRead(getPool(), req.auth!));
  }),
);

notificationRouter.get(
  '/preferences',
  requireAnyPermission('notification_preferences.read', 'notification_preferences.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getPreferences(getPool(), req.auth!));
  }),
);

notificationRouter.patch(
  '/preferences',
  requirePermission('notification_preferences.update'),
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'notifications-prefs' }),
  asyncHandler(async (req, res) => {
    const body = updatePreferencesSchema.parse(req.body);
    sendSuccess(res, await updatePreferences(getPool(), req.auth!, body.preferences));
  }),
);

notificationRouter.get(
  '/deliveries',
  requireAnyPermission('notification_delivery.read', 'notifications.manage', 'notifications.retry'),
  asyncHandler(async (req, res) => {
    const query = listDeliveriesQuerySchema.parse(req.query);
    const result = await listDeliveries(getPool(), req.auth!, query);
    sendSuccess(res, result.deliveries, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

notificationRouter.post(
  '/deliveries/:deliveryId/retry',
  requireAnyPermission('notifications.retry', 'notifications.manage'),
  rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'notifications-retry' }),
  asyncHandler(async (req, res) => {
    const { deliveryId } = deliveryIdParamSchema.parse(req.params);
    const result = await retryNotificationDelivery(getPool(), req.auth!, deliveryId);
    await processDueDeliveries(getPool(), 20);
    sendSuccess(res, result);
  }),
);

notificationRouter.get(
  '/templates',
  requireAnyPermission('notification_templates.read', 'notification_templates.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listTemplates(getPool(), req.auth!));
  }),
);

notificationRouter.patch(
  '/templates/:templateId',
  requirePermission('notification_templates.manage'),
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'notifications-templates' }),
  asyncHandler(async (req, res) => {
    const { templateId } = templateIdParamSchema.parse(req.params);
    const body = updateTemplateSchema.parse(req.body);
    sendSuccess(res, await updateTemplate(getPool(), req.auth!, templateId, body));
  }),
);

notificationRouter.get(
  '/devices',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listDeviceTokens(getPool(), req.auth!));
  }),
);

notificationRouter.post(
  '/devices',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'notifications-devices' }),
  asyncHandler(async (req, res) => {
    const body = registerDeviceSchema.parse(req.body);
    sendSuccess(res, await registerDeviceToken(getPool(), req.auth!, body), 201);
  }),
);

notificationRouter.delete(
  '/devices/:deviceId',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    const { deviceId } = deviceIdParamSchema.parse(req.params);
    sendSuccess(res, await deactivateDeviceToken(getPool(), req.auth!, deviceId));
  }),
);

notificationRouter.post(
  '/:notificationId/read',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    const { notificationId } = notificationIdParamSchema.parse(req.params);
    sendSuccess(res, await markRead(getPool(), req.auth!, notificationId));
  }),
);

notificationRouter.post(
  '/:notificationId/unread',
  requireAnyPermission('notifications.read', 'notifications.manage'),
  asyncHandler(async (req, res) => {
    const { notificationId } = notificationIdParamSchema.parse(req.params);
    sendSuccess(res, await markUnread(getPool(), req.auth!, notificationId));
  }),
);
