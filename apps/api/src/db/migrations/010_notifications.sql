CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  recipient_user_id UUID REFERENCES users(id),
  recipient_email TEXT,
  recipient_phone TEXT,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  channel TEXT NOT NULL,
  priority TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  related_reference TEXT,
  link_path TEXT,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient_present_chk CHECK (
    recipient_user_id IS NOT NULL
    OR recipient_email IS NOT NULL
    OR recipient_phone IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_idx
  ON notifications (dedupe_key);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications (recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_org_created_idx
  ON notifications (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL AND read_at IS NULL AND channel = 'IN_APP';

CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON notifications (type, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_related_idx
  ON notifications (related_entity_type, related_entity_id)
  WHERE related_entity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1 AND max_attempts <= 20),
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  provider TEXT,
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_idempotency_idx
  ON notification_deliveries (idempotency_key);

CREATE INDEX IF NOT EXISTS notification_deliveries_status_retry_idx
  ON notification_deliveries (status, next_retry_at)
  WHERE status IN ('PENDING', 'QUEUED', 'FAILED');

CREATE INDEX IF NOT EXISTS notification_deliveries_org_created_idx
  ON notification_deliveries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx
  ON notification_deliveries (notification_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  digest TEXT NOT NULL DEFAULT 'IMMEDIATE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, channel)
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_idx
  ON notification_preferences (user_id);

CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  subject TEXT,
  body TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, channel, language, version)
);

CREATE INDEX IF NOT EXISTS notification_templates_active_idx
  ON notification_templates (type, channel, language)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS notification_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  device_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS notification_device_tokens_user_idx
  ON notification_device_tokens (user_id, active);

CREATE TABLE IF NOT EXISTS notification_digest_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  digest_type TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO notification_digest_plans (digest_type, channel, schedule_cron, active)
VALUES
  ('DAILY_OPERATIONS', 'EMAIL', '0 6 * * *', false),
  ('DAILY_OVERDUE_INVOICES', 'EMAIL', '0 7 * * *', false),
  ('DOCUMENT_EXPIRY_SUMMARY', 'EMAIL', '0 6 * * *', false)
ON CONFLICT (digest_type) DO NOTHING;

DROP TRIGGER IF EXISTS notifications_set_updated_at ON notifications;
CREATE TRIGGER notifications_set_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_deliveries_set_updated_at ON notification_deliveries;
CREATE TRIGGER notification_deliveries_set_updated_at
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_preferences_set_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_templates_set_updated_at ON notification_templates;
CREATE TRIGGER notification_templates_set_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_device_tokens_set_updated_at ON notification_device_tokens;
CREATE TRIGGER notification_device_tokens_set_updated_at
  BEFORE UPDATE ON notification_device_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_digest_plans_set_updated_at ON notification_digest_plans;
CREATE TRIGGER notification_digest_plans_set_updated_at
  BEFORE UPDATE ON notification_digest_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO notification_templates (type, channel, language, version, subject, body, active)
VALUES
  (
    'ACCOUNT_CREATED',
    'EMAIL',
    'en',
    1,
    'Welcome to {{organization_name}}',
    'Hello {{recipient_name}}, your MizigoX account for {{organization_name}} is ready. You can sign in and start using the platform.',
    true
  ),
  (
    'ACCOUNT_CREATED',
    'IN_APP',
    'en',
    1,
    'Welcome to MizigoX',
    'Your account for {{organization_name}} is ready.',
    true
  ),
  (
    'INVITATION_RECEIVED',
    'EMAIL',
    'en',
    1,
    'You are invited to {{organization_name}}',
    'You have been invited to join {{organization_name}} on MizigoX. Open {{invite_url}} to create your account. This invitation expires soon.',
    true
  ),
  (
    'PASSWORD_CHANGED',
    'EMAIL',
    'en',
    1,
    'Your MizigoX password was changed',
    'Hello {{recipient_name}}, your MizigoX password was changed. If you did not make this change, contact your administrator immediately.',
    true
  ),
  (
    'PASSWORD_CHANGED',
    'IN_APP',
    'en',
    1,
    'Password changed',
    'Your account password was changed.',
    true
  ),
  (
    'SHIPMENT_CREATED',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} created',
    'Shipment {{shipment_reference}} was created for {{customer_name}}. Status: {{shipment_status}}.',
    true
  ),
  (
    'SHIPMENT_CREATED',
    'IN_APP',
    'en',
    1,
    'Shipment created',
    'Shipment {{shipment_reference}} was created.',
    true
  ),
  (
    'SHIPMENT_CONFIRMED',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} confirmed',
    'Shipment {{shipment_reference}} for {{customer_name}} is confirmed. Estimated delivery: {{estimated_delivery}}.',
    true
  ),
  (
    'SHIPMENT_CONFIRMED',
    'IN_APP',
    'en',
    1,
    'Shipment confirmed',
    'Shipment {{shipment_reference}} is confirmed.',
    true
  ),
  (
    'SHIPMENT_READY_FOR_PICKUP',
    'IN_APP',
    'en',
    1,
    'Ready for pickup',
    'Shipment {{shipment_reference}} is ready for pickup.',
    true
  ),
  (
    'SHIPMENT_READY_FOR_PICKUP',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} is ready for pickup',
    'Shipment {{shipment_reference}} for {{customer_name}} is ready for pickup.',
    true
  ),
  (
    'SHIPMENT_PICKED_UP',
    'IN_APP',
    'en',
    1,
    'Shipment picked up',
    'Shipment {{shipment_reference}} has been picked up.',
    true
  ),
  (
    'SHIPMENT_PICKED_UP',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} picked up',
    'Shipment {{shipment_reference}} for {{customer_name}} has been picked up.',
    true
  ),
  (
    'SHIPMENT_PICKED_UP',
    'SMS',
    'en',
    1,
    NULL,
    'MizigoX: shipment {{shipment_reference}} picked up.',
    true
  ),
  (
    'SHIPMENT_IN_TRANSIT',
    'IN_APP',
    'en',
    1,
    'Shipment in transit',
    'Shipment {{shipment_reference}} is in transit.',
    true
  ),
  (
    'SHIPMENT_IN_TRANSIT',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} is in transit',
    'Shipment {{shipment_reference}} for {{customer_name}} is in transit. Estimated delivery: {{estimated_delivery}}.',
    true
  ),
  (
    'SHIPMENT_IN_TRANSIT',
    'SMS',
    'en',
    1,
    NULL,
    'MizigoX: shipment {{shipment_reference}} is in transit.',
    true
  ),
  (
    'SHIPMENT_ARRIVED',
    'IN_APP',
    'en',
    1,
    'Shipment arrived',
    'Shipment {{shipment_reference}} has arrived at destination.',
    true
  ),
  (
    'SHIPMENT_ARRIVED',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} arrived',
    'Shipment {{shipment_reference}} for {{customer_name}} has arrived at destination.',
    true
  ),
  (
    'SHIPMENT_OUT_FOR_DELIVERY',
    'IN_APP',
    'en',
    1,
    'Out for delivery',
    'Shipment {{shipment_reference}} is out for delivery.',
    true
  ),
  (
    'SHIPMENT_OUT_FOR_DELIVERY',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} is out for delivery',
    'Shipment {{shipment_reference}} for {{customer_name}} is out for delivery.',
    true
  ),
  (
    'SHIPMENT_OUT_FOR_DELIVERY',
    'SMS',
    'en',
    1,
    NULL,
    'MizigoX: shipment {{shipment_reference}} is out for delivery.',
    true
  ),
  (
    'SHIPMENT_DELIVERED',
    'IN_APP',
    'en',
    1,
    'Shipment delivered',
    'Shipment {{shipment_reference}} was delivered.',
    true
  ),
  (
    'SHIPMENT_DELIVERED',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} delivered',
    'Shipment {{shipment_reference}} for {{customer_name}} has been delivered.',
    true
  ),
  (
    'SHIPMENT_DELIVERED',
    'SMS',
    'en',
    1,
    NULL,
    'MizigoX: shipment {{shipment_reference}} delivered.',
    true
  ),
  (
    'SHIPMENT_DELIVERY_FAILED',
    'IN_APP',
    'en',
    1,
    'Delivery failed',
    'Delivery failed for shipment {{shipment_reference}}.',
    true
  ),
  (
    'SHIPMENT_DELIVERY_FAILED',
    'EMAIL',
    'en',
    1,
    'Delivery failed for {{shipment_reference}}',
    'Delivery could not be completed for shipment {{shipment_reference}} ({{customer_name}}). Operations should follow up.',
    true
  ),
  (
    'SHIPMENT_DELIVERY_FAILED',
    'SMS',
    'en',
    1,
    NULL,
    'MizigoX: delivery failed for shipment {{shipment_reference}}. Please follow up.',
    true
  ),
  (
    'SHIPMENT_CANCELLED',
    'IN_APP',
    'en',
    1,
    'Shipment cancelled',
    'Shipment {{shipment_reference}} was cancelled.',
    true
  ),
  (
    'SHIPMENT_CANCELLED',
    'EMAIL',
    'en',
    1,
    'Shipment {{shipment_reference}} cancelled',
    'Shipment {{shipment_reference}} for {{customer_name}} was cancelled.',
    true
  ),
  (
    'ROUTE_PLANNED',
    'IN_APP',
    'en',
    1,
    'Route planned',
    'Route {{route_reference}} has been planned.',
    true
  ),
  (
    'ROUTE_DRIVER_ASSIGNED',
    'IN_APP',
    'en',
    1,
    'Driver assigned',
    'You were assigned to route {{route_reference}}.',
    true
  ),
  (
    'ROUTE_VEHICLE_ASSIGNED',
    'IN_APP',
    'en',
    1,
    'Vehicle assigned',
    'Vehicle {{vehicle_registration}} was assigned to route {{route_reference}}.',
    true
  ),
  (
    'ROUTE_DISPATCHED',
    'IN_APP',
    'en',
    1,
    'Route dispatched',
    'Route {{route_reference}} has been dispatched.',
    true
  ),
  (
    'ROUTE_DISPATCHED',
    'EMAIL',
    'en',
    1,
    'Route {{route_reference}} dispatched',
    'Route {{route_reference}} was dispatched. Driver: {{driver_name}}. Vehicle: {{vehicle_registration}}.',
    true
  ),
  (
    'ROUTE_STARTED',
    'IN_APP',
    'en',
    1,
    'Route started',
    'Route {{route_reference}} is in transit.',
    true
  ),
  (
    'ROUTE_ARRIVED',
    'IN_APP',
    'en',
    1,
    'Route arrived',
    'Route {{route_reference}} has arrived.',
    true
  ),
  (
    'ROUTE_COMPLETED',
    'IN_APP',
    'en',
    1,
    'Route completed',
    'Route {{route_reference}} is complete.',
    true
  ),
  (
    'ROUTE_CANCELLED',
    'IN_APP',
    'en',
    1,
    'Route cancelled',
    'Route {{route_reference}} was cancelled.',
    true
  ),
  (
    'TRACKING_STARTED',
    'IN_APP',
    'en',
    1,
    'Tracking started',
    'Live tracking is available for shipment {{shipment_reference}}.',
    true
  ),
  (
    'TRACKING_LOCATION_STALE',
    'IN_APP',
    'en',
    1,
    'Vehicle location stale',
    'Location for vehicle {{vehicle_registration}} is stale or unavailable.',
    true
  ),
  (
    'TRACKING_SIGNIFICANT_EVENT',
    'IN_APP',
    'en',
    1,
    'Tracking update',
    'A significant tracking event was recorded for {{shipment_reference}}{{route_reference}}.',
    true
  ),
  (
    'INVOICE_CREATED',
    'IN_APP',
    'en',
    1,
    'Invoice created',
    'Invoice {{invoice_number}} was created for {{customer_name}}.',
    true
  ),
  (
    'INVOICE_ISSUED',
    'IN_APP',
    'en',
    1,
    'Invoice issued',
    'Invoice {{invoice_number}} was issued for {{amount}} {{currency}}.',
    true
  ),
  (
    'INVOICE_ISSUED',
    'EMAIL',
    'en',
    1,
    'Invoice {{invoice_number}} issued',
    'Invoice {{invoice_number}} for {{customer_name}} was issued for {{amount}} {{currency}}. Due date: {{due_date}}.',
    true
  ),
  (
    'INVOICE_DUE_SOON',
    'IN_APP',
    'en',
    1,
    'Invoice due soon',
    'Invoice {{invoice_number}} is due on {{due_date}}.',
    true
  ),
  (
    'INVOICE_DUE_SOON',
    'EMAIL',
    'en',
    1,
    'Invoice {{invoice_number}} is due soon',
    'Invoice {{invoice_number}} for {{customer_name}} ({{amount}} {{currency}}) is due on {{due_date}}.',
    true
  ),
  (
    'INVOICE_OVERDUE',
    'IN_APP',
    'en',
    1,
    'Invoice overdue',
    'Invoice {{invoice_number}} is overdue.',
    true
  ),
  (
    'INVOICE_OVERDUE',
    'EMAIL',
    'en',
    1,
    'Invoice {{invoice_number}} is overdue',
    'Invoice {{invoice_number}} for {{customer_name}} ({{amount}} {{currency}}) is overdue. Original due date: {{due_date}}.',
    true
  ),
  (
    'INVOICE_PAID',
    'IN_APP',
    'en',
    1,
    'Invoice paid',
    'Invoice {{invoice_number}} has been paid.',
    true
  ),
  (
    'INVOICE_PAID',
    'EMAIL',
    'en',
    1,
    'Invoice {{invoice_number}} paid',
    'Payment was confirmed for invoice {{invoice_number}} ({{amount}} {{currency}}).',
    true
  ),
  (
    'PAYMENT_RECEIVED',
    'IN_APP',
    'en',
    1,
    'Payment received',
    'Payment {{payment_reference}} of {{amount}} {{currency}} was received for invoice {{invoice_number}}.',
    true
  ),
  (
    'PAYMENT_RECEIVED',
    'EMAIL',
    'en',
    1,
    'Payment received for invoice {{invoice_number}}',
    'We received payment {{payment_reference}} of {{amount}} {{currency}} for invoice {{invoice_number}} ({{customer_name}}).',
    true
  ),
  (
    'PAYMENT_FAILED',
    'IN_APP',
    'en',
    1,
    'Payment failed',
    'Payment {{payment_reference}} for invoice {{invoice_number}} failed.',
    true
  ),
  (
    'PAYMENT_FAILED',
    'EMAIL',
    'en',
    1,
    'Payment failed for invoice {{invoice_number}}',
    'Payment {{payment_reference}} of {{amount}} {{currency}} for invoice {{invoice_number}} could not be completed.',
    true
  ),
  (
    'VEHICLE_DOCUMENT_EXPIRING',
    'IN_APP',
    'en',
    1,
    'Vehicle document expiring',
    '{{document_type}} for vehicle {{vehicle_registration}} expires on {{expiry_date}}.',
    true
  ),
  (
    'VEHICLE_DOCUMENT_EXPIRING',
    'EMAIL',
    'en',
    1,
    'Vehicle document expiring: {{vehicle_registration}}',
    '{{document_type}} for vehicle {{vehicle_registration}} at {{organization_name}} expires on {{expiry_date}}.',
    true
  ),
  (
    'VEHICLE_DOCUMENT_EXPIRED',
    'IN_APP',
    'en',
    1,
    'Vehicle document expired',
    '{{document_type}} for vehicle {{vehicle_registration}} has expired.',
    true
  ),
  (
    'VEHICLE_DOCUMENT_EXPIRED',
    'EMAIL',
    'en',
    1,
    'Vehicle document expired: {{vehicle_registration}}',
    '{{document_type}} for vehicle {{vehicle_registration}} at {{organization_name}} expired on {{expiry_date}}.',
    true
  ),
  (
    'DRIVER_LICENSE_EXPIRING',
    'IN_APP',
    'en',
    1,
    'Driver license expiring',
    'Driver license for {{driver_name}} expires on {{expiry_date}}.',
    true
  ),
  (
    'DRIVER_LICENSE_EXPIRING',
    'EMAIL',
    'en',
    1,
    'Driver license expiring: {{driver_name}}',
    'The driving licence for {{driver_name}} at {{organization_name}} expires on {{expiry_date}}.',
    true
  ),
  (
    'DRIVER_DOCUMENT_EXPIRED',
    'IN_APP',
    'en',
    1,
    'Driver document expired',
    '{{document_type}} for {{driver_name}} has expired.',
    true
  ),
  (
    'DRIVER_DOCUMENT_EXPIRED',
    'EMAIL',
    'en',
    1,
    'Driver document expired: {{driver_name}}',
    '{{document_type}} for {{driver_name}} at {{organization_name}} expired on {{expiry_date}}.',
    true
  ),
  (
    'VEHICLE_UNAVAILABLE',
    'IN_APP',
    'en',
    1,
    'Vehicle unavailable',
    'Vehicle {{vehicle_registration}} is unavailable.',
    true
  ),
  (
    'DRIVER_UNAVAILABLE',
    'IN_APP',
    'en',
    1,
    'Driver unavailable',
    'Driver {{driver_name}} is unavailable.',
    true
  )
ON CONFLICT (type, channel, language, version) DO NOTHING;
