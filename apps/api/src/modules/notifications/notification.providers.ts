import { getEnv } from '../../config/env.js';
import { unprocessable } from '../../lib/errors.js';
import type {
  EmailMessage,
  ProviderResult,
  PushMessage,
  SmsMessage,
} from './notification.types.js';

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<ProviderResult>;
}

export interface SmsProvider {
  name: string;
  send(message: SmsMessage): Promise<ProviderResult>;
}

export interface PushProvider {
  name: string;
  send(message: PushMessage): Promise<ProviderResult>;
}

class LogEmailProvider implements EmailProvider {
  name = 'log';
  async send(message: EmailMessage): Promise<ProviderResult> {
    console.info('[notifications:email:log]', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return { provider: this.name, providerMessageId: `log-email-${Date.now()}` };
  }
}

class LogSmsProvider implements SmsProvider {
  name = 'log';
  async send(message: SmsMessage): Promise<ProviderResult> {
    console.info('[notifications:sms:log]', { to: message.to, body: message.body });
    return { provider: this.name, providerMessageId: `log-sms-${Date.now()}` };
  }
}

class UnconfiguredEmailProvider implements EmailProvider {
  constructor(public name: string) {}
  async send(): Promise<ProviderResult> {
    throw unprocessable(
      `Email provider ${this.name} is not configured. Set provider credentials and NOTIFICATION_EMAIL_ENABLED=true before sending live email.`,
    );
  }
}

class UnconfiguredSmsProvider implements SmsProvider {
  constructor(public name: string) {}
  async send(): Promise<ProviderResult> {
    throw unprocessable(
      `SMS provider ${this.name} is not configured. Set provider credentials and NOTIFICATION_SMS_ENABLED=true before sending live SMS.`,
    );
  }
}

class DisabledPushProvider implements PushProvider {
  name = 'disabled';
  async send(): Promise<ProviderResult> {
    throw unprocessable(
      'Push notifications are not configured. Register a provider before sending live push messages.',
    );
  }
}

class ResendEmailProvider implements EmailProvider {
  name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage): Promise<ProviderResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected the message (${response.status})`);
    }
    const body = (await response.json()) as { id?: string };
    return { provider: this.name, providerMessageId: body.id };
  }
}

class SendGridEmailProvider implements EmailProvider {
  name = 'sendgrid';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(message: EmailMessage): Promise<ProviderResult> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: this.from },
        subject: message.subject,
        content: [{ type: 'text/plain', value: message.text }],
      }),
    });
    if (!response.ok) {
      throw new Error(`SendGrid rejected the message (${response.status})`);
    }
    return {
      provider: this.name,
      providerMessageId: response.headers.get('x-message-id') ?? undefined,
    };
  }
}

class HttpSmsProvider implements SmsProvider {
  name = 'http';
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly from?: string,
  ) {}
  async send(message: SmsMessage): Promise<ProviderResult> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        from: this.from,
        body: message.body,
      }),
    });
    if (!response.ok) {
      throw new Error(`SMS provider rejected the message (${response.status})`);
    }
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { provider: this.name, providerMessageId: body.id };
  }
}

let emailOverride: EmailProvider | null = null;
let smsOverride: SmsProvider | null = null;
let pushOverride: PushProvider | null = null;

export function overrideEmailProviderForTests(provider: EmailProvider | null) {
  emailOverride = provider;
}

export function overrideSmsProviderForTests(provider: SmsProvider | null) {
  smsOverride = provider;
}

export function overridePushProviderForTests(provider: PushProvider | null) {
  pushOverride = provider;
}

export function resolveEmailProvider(): EmailProvider {
  if (emailOverride) {
    return emailOverride;
  }
  const env = getEnv();
  if (!env.NOTIFICATION_EMAIL_ENABLED || env.NOTIFICATION_EMAIL_PROVIDER === 'log') {
    return new LogEmailProvider();
  }
  const from = env.SMTP_FROM ?? 'MizigoX <notifications@localhost>';
  if (env.NOTIFICATION_EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) {
      return new UnconfiguredEmailProvider('resend');
    }
    return new ResendEmailProvider(env.RESEND_API_KEY, from);
  }
  if (env.NOTIFICATION_EMAIL_PROVIDER === 'sendgrid') {
    if (!env.SENDGRID_API_KEY) {
      return new UnconfiguredEmailProvider('sendgrid');
    }
    return new SendGridEmailProvider(env.SENDGRID_API_KEY, from);
  }
  if (env.NOTIFICATION_EMAIL_PROVIDER === 'smtp') {
    if (!env.SMTP_URL || !env.SMTP_FROM) {
      return new UnconfiguredEmailProvider('smtp');
    }
    return new UnconfiguredEmailProvider('smtp');
  }
  return new UnconfiguredEmailProvider(env.NOTIFICATION_EMAIL_PROVIDER);
}

export function resolveSmsProvider(): SmsProvider {
  if (smsOverride) {
    return smsOverride;
  }
  const env = getEnv();
  if (!env.NOTIFICATION_SMS_ENABLED || env.NOTIFICATION_SMS_PROVIDER === 'log') {
    return new LogSmsProvider();
  }
  if (env.SMS_API_BASE_URL && env.SMS_API_KEY) {
    return new HttpSmsProvider(env.SMS_API_BASE_URL, env.SMS_API_KEY, env.SMS_FROM);
  }
  return new UnconfiguredSmsProvider(env.NOTIFICATION_SMS_PROVIDER);
}

export function resolvePushProvider(): PushProvider {
  if (pushOverride) {
    return pushOverride;
  }
  const env = getEnv();
  if (!env.NOTIFICATION_PUSH_ENABLED || env.NOTIFICATION_PUSH_PROVIDER === 'disabled') {
    return new DisabledPushProvider();
  }
  if (env.NOTIFICATION_PUSH_PROVIDER === 'log') {
    return {
      name: 'log',
      async send(message) {
        console.info('[notifications:push:log]', {
          tokenHint: message.token.slice(-6),
          title: message.title,
        });
        return { provider: 'log', providerMessageId: `log-push-${Date.now()}` };
      },
    };
  }
  return new DisabledPushProvider();
}

export function isPermanentDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid recipient') ||
    lower.includes('invalid email') ||
    lower.includes('invalid phone') ||
    lower.includes('not configured') ||
    lower.includes('disabled')
  );
}

export function safeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Delivery failed';
  return message
    .replace(/(api[_-]?key|secret|token|password|bearer)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 400);
}
