import { hasAnyPermission } from './customers.js';
import type { InvoiceStatus } from './billing.js';
import type { RouteStatus } from './routes.js';
import type { ShipmentStatus } from './shipments.js';

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_DELIVERY_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'READ',
] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const NOTIFICATION_CATEGORIES = [
  'SHIPMENT',
  'ROUTE',
  'TRACKING',
  'INVOICE',
  'FLEET',
  'ACCOUNT',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_DIGEST_MODES = ['IMMEDIATE', 'DAILY'] as const;
export type NotificationDigestMode = (typeof NOTIFICATION_DIGEST_MODES)[number];

export const PUSH_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export const NOTIFICATION_TYPES = [
  'SHIPMENT_CREATED',
  'SHIPMENT_CONFIRMED',
  'SHIPMENT_READY_FOR_PICKUP',
  'SHIPMENT_PICKED_UP',
  'SHIPMENT_IN_TRANSIT',
  'SHIPMENT_ARRIVED',
  'SHIPMENT_OUT_FOR_DELIVERY',
  'SHIPMENT_DELIVERED',
  'SHIPMENT_DELIVERY_FAILED',
  'SHIPMENT_CANCELLED',
  'ROUTE_PLANNED',
  'ROUTE_DRIVER_ASSIGNED',
  'ROUTE_VEHICLE_ASSIGNED',
  'ROUTE_DISPATCHED',
  'ROUTE_STARTED',
  'ROUTE_ARRIVED',
  'ROUTE_COMPLETED',
  'ROUTE_CANCELLED',
  'TRACKING_STARTED',
  'TRACKING_LOCATION_STALE',
  'TRACKING_SIGNIFICANT_EVENT',
  'INVOICE_CREATED',
  'INVOICE_ISSUED',
  'INVOICE_DUE_SOON',
  'INVOICE_OVERDUE',
  'INVOICE_PAID',
  'PAYMENT_FAILED',
  'PAYMENT_RECEIVED',
  'VEHICLE_DOCUMENT_EXPIRING',
  'VEHICLE_DOCUMENT_EXPIRED',
  'DRIVER_LICENSE_EXPIRING',
  'DRIVER_DOCUMENT_EXPIRED',
  'VEHICLE_UNAVAILABLE',
  'DRIVER_UNAVAILABLE',
  'INVITATION_RECEIVED',
  'ACCOUNT_CREATED',
  'PASSWORD_CHANGED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TEMPLATE_LANGUAGES = ['en', 'fr', 'sw', 'rw'] as const;
export type NotificationTemplateLanguage = (typeof NOTIFICATION_TEMPLATE_LANGUAGES)[number];

export const TEMPLATE_VARIABLE_NAMES = [
  'customer_name',
  'shipment_reference',
  'shipment_status',
  'route_reference',
  'invoice_number',
  'amount',
  'currency',
  'estimated_delivery',
  'organization_name',
  'invite_url',
  'recipient_name',
  'vehicle_registration',
  'driver_name',
  'document_type',
  'expiry_date',
  'due_date',
  'payment_reference',
] as const;
export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_NAMES)[number];

export const MANDATORY_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'INVITATION_RECEIVED',
  'ACCOUNT_CREATED',
  'PASSWORD_CHANGED',
];

export const SMS_DEFAULT_TYPES: readonly NotificationType[] = [
  'SHIPMENT_PICKED_UP',
  'SHIPMENT_IN_TRANSIT',
  'SHIPMENT_OUT_FOR_DELIVERY',
  'SHIPMENT_DELIVERED',
  'SHIPMENT_DELIVERY_FAILED',
];

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  SHIPMENT_CREATED: 'SHIPMENT',
  SHIPMENT_CONFIRMED: 'SHIPMENT',
  SHIPMENT_READY_FOR_PICKUP: 'SHIPMENT',
  SHIPMENT_PICKED_UP: 'SHIPMENT',
  SHIPMENT_IN_TRANSIT: 'SHIPMENT',
  SHIPMENT_ARRIVED: 'SHIPMENT',
  SHIPMENT_OUT_FOR_DELIVERY: 'SHIPMENT',
  SHIPMENT_DELIVERED: 'SHIPMENT',
  SHIPMENT_DELIVERY_FAILED: 'SHIPMENT',
  SHIPMENT_CANCELLED: 'SHIPMENT',
  ROUTE_PLANNED: 'ROUTE',
  ROUTE_DRIVER_ASSIGNED: 'ROUTE',
  ROUTE_VEHICLE_ASSIGNED: 'ROUTE',
  ROUTE_DISPATCHED: 'ROUTE',
  ROUTE_STARTED: 'ROUTE',
  ROUTE_ARRIVED: 'ROUTE',
  ROUTE_COMPLETED: 'ROUTE',
  ROUTE_CANCELLED: 'ROUTE',
  TRACKING_STARTED: 'TRACKING',
  TRACKING_LOCATION_STALE: 'TRACKING',
  TRACKING_SIGNIFICANT_EVENT: 'TRACKING',
  INVOICE_CREATED: 'INVOICE',
  INVOICE_ISSUED: 'INVOICE',
  INVOICE_DUE_SOON: 'INVOICE',
  INVOICE_OVERDUE: 'INVOICE',
  INVOICE_PAID: 'INVOICE',
  PAYMENT_FAILED: 'INVOICE',
  PAYMENT_RECEIVED: 'INVOICE',
  VEHICLE_DOCUMENT_EXPIRING: 'FLEET',
  VEHICLE_DOCUMENT_EXPIRED: 'FLEET',
  DRIVER_LICENSE_EXPIRING: 'FLEET',
  DRIVER_DOCUMENT_EXPIRED: 'FLEET',
  VEHICLE_UNAVAILABLE: 'FLEET',
  DRIVER_UNAVAILABLE: 'FLEET',
  INVITATION_RECEIVED: 'ACCOUNT',
  ACCOUNT_CREATED: 'ACCOUNT',
  PASSWORD_CHANGED: 'ACCOUNT',
};

const PRIORITY_BY_TYPE: Record<NotificationType, NotificationPriority> = {
  SHIPMENT_CREATED: 'LOW',
  SHIPMENT_CONFIRMED: 'NORMAL',
  SHIPMENT_READY_FOR_PICKUP: 'NORMAL',
  SHIPMENT_PICKED_UP: 'NORMAL',
  SHIPMENT_IN_TRANSIT: 'NORMAL',
  SHIPMENT_ARRIVED: 'NORMAL',
  SHIPMENT_OUT_FOR_DELIVERY: 'NORMAL',
  SHIPMENT_DELIVERED: 'NORMAL',
  SHIPMENT_DELIVERY_FAILED: 'HIGH',
  SHIPMENT_CANCELLED: 'HIGH',
  ROUTE_PLANNED: 'LOW',
  ROUTE_DRIVER_ASSIGNED: 'NORMAL',
  ROUTE_VEHICLE_ASSIGNED: 'NORMAL',
  ROUTE_DISPATCHED: 'HIGH',
  ROUTE_STARTED: 'NORMAL',
  ROUTE_ARRIVED: 'NORMAL',
  ROUTE_COMPLETED: 'NORMAL',
  ROUTE_CANCELLED: 'HIGH',
  TRACKING_STARTED: 'LOW',
  TRACKING_LOCATION_STALE: 'HIGH',
  TRACKING_SIGNIFICANT_EVENT: 'HIGH',
  INVOICE_CREATED: 'LOW',
  INVOICE_ISSUED: 'NORMAL',
  INVOICE_DUE_SOON: 'HIGH',
  INVOICE_OVERDUE: 'HIGH',
  INVOICE_PAID: 'NORMAL',
  PAYMENT_FAILED: 'HIGH',
  PAYMENT_RECEIVED: 'NORMAL',
  VEHICLE_DOCUMENT_EXPIRING: 'HIGH',
  VEHICLE_DOCUMENT_EXPIRED: 'HIGH',
  DRIVER_LICENSE_EXPIRING: 'HIGH',
  DRIVER_DOCUMENT_EXPIRED: 'HIGH',
  VEHICLE_UNAVAILABLE: 'HIGH',
  DRIVER_UNAVAILABLE: 'HIGH',
  INVITATION_RECEIVED: 'CRITICAL',
  ACCOUNT_CREATED: 'CRITICAL',
  PASSWORD_CHANGED: 'CRITICAL',
};

export const DEFAULT_CATEGORY_CHANNELS: Record<
  NotificationCategory,
  Record<NotificationChannel, boolean>
> = {
  SHIPMENT: { IN_APP: true, EMAIL: true, SMS: false, PUSH: false },
  ROUTE: { IN_APP: true, EMAIL: false, SMS: false, PUSH: false },
  TRACKING: { IN_APP: true, EMAIL: false, SMS: false, PUSH: false },
  INVOICE: { IN_APP: true, EMAIL: true, SMS: false, PUSH: false },
  FLEET: { IN_APP: true, EMAIL: true, SMS: false, PUSH: false },
  ACCOUNT: { IN_APP: true, EMAIL: true, SMS: false, PUSH: false },
};

const TEMPLATE_TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function notificationCategory(type: NotificationType): NotificationCategory {
  return CATEGORY_BY_TYPE[type];
}

export function notificationPriority(type: NotificationType): NotificationPriority {
  return PRIORITY_BY_TYPE[type];
}

export function isMandatoryNotificationType(type: NotificationType) {
  return MANDATORY_NOTIFICATION_TYPES.includes(type);
}

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function shipmentNotificationType(status: ShipmentStatus): NotificationType | null {
  switch (status) {
    case 'PENDING':
      return 'SHIPMENT_CREATED';
    case 'CONFIRMED':
      return 'SHIPMENT_CONFIRMED';
    case 'READY_FOR_PICKUP':
      return 'SHIPMENT_READY_FOR_PICKUP';
    case 'PICKED_UP':
      return 'SHIPMENT_PICKED_UP';
    case 'IN_TRANSIT':
      return 'SHIPMENT_IN_TRANSIT';
    case 'AT_DESTINATION':
      return 'SHIPMENT_ARRIVED';
    case 'OUT_FOR_DELIVERY':
      return 'SHIPMENT_OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return 'SHIPMENT_DELIVERED';
    case 'DELIVERY_FAILED':
      return 'SHIPMENT_DELIVERY_FAILED';
    case 'CANCELLED':
      return 'SHIPMENT_CANCELLED';
    default:
      return null;
  }
}

export function routeNotificationType(status: RouteStatus): NotificationType | null {
  switch (status) {
    case 'PLANNED':
      return 'ROUTE_PLANNED';
    case 'DISPATCHED':
      return 'ROUTE_DISPATCHED';
    case 'IN_TRANSIT':
      return 'ROUTE_STARTED';
    case 'ARRIVED':
      return 'ROUTE_ARRIVED';
    case 'COMPLETED':
      return 'ROUTE_COMPLETED';
    case 'CANCELLED':
      return 'ROUTE_CANCELLED';
    default:
      return null;
  }
}

export function invoiceNotificationType(status: InvoiceStatus): NotificationType | null {
  switch (status) {
    case 'DRAFT':
      return 'INVOICE_CREATED';
    case 'ISSUED':
      return 'INVOICE_ISSUED';
    case 'OVERDUE':
      return 'INVOICE_OVERDUE';
    case 'PAID':
      return 'INVOICE_PAID';
    default:
      return null;
  }
}

export function defaultChannelEnabled(
  category: NotificationCategory,
  channel: NotificationChannel,
  type?: NotificationType,
) {
  if (type && isMandatoryNotificationType(type) && (channel === 'IN_APP' || channel === 'EMAIL')) {
    return true;
  }
  if (type && channel === 'SMS' && SMS_DEFAULT_TYPES.includes(type)) {
    return true;
  }
  return DEFAULT_CATEGORY_CHANNELS[category][channel];
}

export function renderNotificationTemplate(
  template: string,
  variables: Record<string, string | null | undefined>,
) {
  return template.replace(TEMPLATE_TOKEN, (_match, name: string) => {
    if (!(TEMPLATE_VARIABLE_NAMES as readonly string[]).includes(name)) {
      return '';
    }
    return variables[name] ?? '';
  });
}

export function notificationTypeLabel(type: string) {
  return type
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (char) => char.toUpperCase());
}

export function notificationCategoryLabel(category: string) {
  switch (category) {
    case 'SHIPMENT':
      return 'Shipment updates';
    case 'ROUTE':
      return 'Route and dispatch';
    case 'TRACKING':
      return 'Tracking alerts';
    case 'INVOICE':
      return 'Invoice updates';
    case 'FLEET':
      return 'Operational alerts';
    case 'ACCOUNT':
      return 'Account and security';
    default:
      return category;
  }
}

export function canReadNotifications(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notifications.read', 'notifications.manage');
}

export function canManageNotifications(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notifications.manage');
}

export function canRetryNotifications(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notifications.retry', 'notifications.manage');
}

export function canReadNotificationDelivery(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'notification_delivery.read',
    'notifications.manage',
    'notifications.retry',
  );
}

export function canReadNotificationTemplates(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notification_templates.read', 'notification_templates.manage');
}

export function canManageNotificationTemplates(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notification_templates.manage');
}

export function canReadNotificationPreferences(granted: readonly string[] | undefined) {
  return hasAnyPermission(
    granted,
    'notification_preferences.read',
    'notification_preferences.update',
  );
}

export function canUpdateNotificationPreferences(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'notification_preferences.update');
}

export interface NotificationPayload {
  id: string;
  organizationId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedReference: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface NotificationPreferencePayload {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  digest: NotificationDigestMode;
  mandatory: boolean;
}

export interface NotificationDeliveryPayload {
  id: string;
  notificationId: string;
  organizationId: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  provider: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  title?: string;
  message?: string;
}

export interface NotificationTemplatePayload {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  language: string;
  version: number;
  subject: string | null;
  body: string;
  active: boolean;
  updatedAt: string;
}

export interface NotificationDeviceTokenPayload {
  id: string;
  platform: PushPlatform;
  deviceName: string | null;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface UnreadCountPayload {
  unreadCount: number;
}
