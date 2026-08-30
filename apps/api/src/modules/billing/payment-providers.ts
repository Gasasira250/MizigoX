import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../../config/env.js';
import { unprocessable } from '../../lib/errors.js';
import type { PaymentProviderCode } from '@mizigox/shared';

export interface PaymentInitiation {
  provider: PaymentProviderCode;
  status: 'PENDING' | 'PROCESSING';
  providerReference: string | null;
}

export interface PaymentProvider {
  code: PaymentProviderCode;
  initiate(input: { amount: string; currencyCode: string; reference: string }): PaymentInitiation;
}

class ManualPaymentProvider implements PaymentProvider {
  code: PaymentProviderCode = 'MANUAL';
  initiate(): PaymentInitiation {
    return { provider: 'MANUAL', status: 'PENDING', providerReference: null };
  }
}

class UnconfiguredProvider implements PaymentProvider {
  constructor(public code: PaymentProviderCode) {}
  initiate(): PaymentInitiation {
    throw unprocessable(
      `${this.code} payments are not configured. Set provider credentials in the environment before initiating live payments.`,
    );
  }
}

export function resolvePaymentProvider(requested?: PaymentProviderCode): PaymentProvider {
  const env = getEnv();
  const code = requested ?? env.PAYMENT_DEFAULT_PROVIDER;
  if (code === 'MANUAL') {
    return new ManualPaymentProvider();
  }
  if (env.PAYMENT_GATEWAY_BASE_URL && env.PAYMENT_GATEWAY_API_KEY) {
    return new UnconfiguredProvider(code);
  }
  return new UnconfiguredProvider(code);
}

export function verifyProviderWebhook(signature: string | undefined, rawBody: string) {
  const secret = getEnv().PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    throw unprocessable('Payment provider webhooks are not configured');
  }
  if (!signature) {
    throw unprocessable('Webhook signature is missing');
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = signature.replace(/^sha256=/, '');
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    throw unprocessable('Webhook signature is invalid');
  }
}
