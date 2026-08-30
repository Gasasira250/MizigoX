import { getEnv } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEYS = [
  'password',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'api_key',
  'webhook',
  'jwt',
  'credential',
];

function shouldLog(level: LogLevel) {
  try {
    const configured = getEnv().LOG_LEVEL;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[configured];
  } catch {
    return true;
  }
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(
        /(api[_-]?key|secret|token|password|bearer|authorization)\s*[:=]\s*\S+/gi,
        '$1=[redacted]',
      )
      .replace(/postgres:\/\/[^@\s]+@/gi, 'postgres://[redacted]@');
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (SECRET_KEYS.some((secret) => key.toLowerCase().includes(secret))) {
        return [key, '[redacted]'];
      }
      return [key, redact(nested)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

function write(level: LogLevel, message: string, extra?: Record<string, unknown>) {
  if (!shouldLog(level)) {
    return;
  }
  const payload = {
    level,
    time: new Date().toISOString(),
    service: 'mizigox-api',
    message,
    ...(extra ? (redact(extra) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) => write('debug', message, extra),
  info: (message: string, extra?: Record<string, unknown>) => write('info', message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => write('warn', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write('error', message, extra),
};
