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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters')
    .refine((value) => !value.startsWith('CHANGE_ME'), 'JWT_ACCESS_SECRET must be replaced'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
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
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid environment configuration: ${details}`);
    }
    cachedEnv = parsed.data;
  }

  return cachedEnv;
}

export function resetEnvCache() {
  cachedEnv = undefined;
}
