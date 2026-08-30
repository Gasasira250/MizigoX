import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(workspaceRoot, '.env'));

const booleanish = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  WEB_ORIGINS: z.string().optional(),
  APP_PUBLIC_URL: z.string().url().optional(),
  API_PUBLIC_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanish,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    .refine((value) => !value.startsWith('CHANGE_ME'), 'JWT_ACCESS_SECRET must be replaced'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: booleanish,
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  MIGRATE_ON_BOOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12, 'SEED_ADMIN_PASSWORD must be at least 12 characters')
    .refine((value) => !value.startsWith('CHANGE_ME'), 'SEED_ADMIN_PASSWORD must be replaced'),
  SEED_ADMIN_FIRST_NAME: z.string().min(1).default('Platform'),
  SEED_ADMIN_LAST_NAME: z.string().min(1).default('Admin'),
  SEED_ON_BOOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().optional(),
  TRACKING_LIVE_SECONDS: z.coerce.number().int().positive().default(60),
  TRACKING_RECENT_SECONDS: z.coerce.number().int().positive().default(300),
  TRACKING_STALE_SECONDS: z.coerce.number().int().positive().default(900),
  TRACKING_MAX_FUTURE_SKEW_SECONDS: z.coerce.number().int().positive().default(300),
  TRACKING_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
  TRACKING_LOCATION_RATE_MAX: z.coerce.number().int().positive().default(60),
  TRACKING_LOCATION_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MAP_PROVIDER: z.enum(['none', 'osm', 'mapbox', 'google']).default('osm'),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  PAYMENT_DEFAULT_PROVIDER: z
    .enum(['MANUAL', 'MOBILE_MONEY', 'BANK', 'CARD_GATEWAY', 'OTHER'])
    .default('MANUAL'),
  PAYMENT_GATEWAY_BASE_URL: z.string().url().optional(),
  PAYMENT_GATEWAY_API_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  NOTIFICATION_EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend', 'sendgrid', 'ses']).default('log'),
  NOTIFICATION_SMS_PROVIDER: z.enum(['log', 'http']).default('log'),
  NOTIFICATION_PUSH_PROVIDER: z.enum(['disabled', 'log', 'fcm', 'apns']).default('disabled'),
  NOTIFICATION_EMAIL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NOTIFICATION_SMS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NOTIFICATION_PUSH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  AWS_SES_REGION: z.string().optional(),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),
  SMS_API_BASE_URL: z.string().url().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_FROM: z.string().optional(),
  PUSH_FCM_SERVER_KEY: z.string().optional(),
  STORAGE_PROVIDER: z.enum(['local', 's3', 'none']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('var/storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function isProductionLike(env: Pick<AppEnv, 'NODE_ENV' | 'APP_ENV'>): boolean {
  return env.NODE_ENV === 'production' || env.APP_ENV === 'production';
}

export function assertProductionSafety(env: AppEnv): void {
  if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
    throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }
  if (env.STORAGE_PROVIDER === 's3' && (!env.S3_BUCKET || !env.S3_REGION)) {
    throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET and S3_REGION');
  }
  if (!isProductionLike(env)) {
    return;
  }
  if (env.SEED_ON_BOOT) {
    throw new Error('SEED_ON_BOOT must be false in production');
  }
  if (!env.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production (HTTPS is required)');
  }
}

export function parseAppEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env: AppEnv = {
    ...parsed.data,
    APP_ENV:
      parsed.data.APP_ENV ?? (parsed.data.NODE_ENV === 'production' ? 'production' : 'development'),
  };
  assertProductionSafety(env);
  return env;
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = parseAppEnv();
  }
  return cachedEnv;
}

export function allowedWebOrigins(env = getEnv()): string[] {
  const extras = (env.WEB_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([env.WEB_ORIGIN, ...extras])];
}

export function publicAppUrl(env = getEnv()): string {
  return (env.APP_PUBLIC_URL ?? env.WEB_ORIGIN).replace(/\/$/, '');
}

export function resetEnvCache() {
  cachedEnv = undefined;
}
