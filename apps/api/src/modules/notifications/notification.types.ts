import type { NotificationChannel, NotificationType } from '@mizigox/shared';

export interface NotificationEvent {
  type: NotificationType;
  organizationId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  relatedReference?: string;
  variables?: Record<string, string | null | undefined>;
  actorUserId?: string;
  customerOrganizationId?: string;
  operatorOrganizationId?: string;
  driverId?: string;
  recipientUserId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channels?: NotificationChannel[];
  idempotencySuffix?: string;
}

export interface ResolvedRecipient {
  userId: string | null;
  organizationId: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: string;
  orgType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
}

export interface ProviderResult {
  provider: string;
  providerMessageId?: string;
}
