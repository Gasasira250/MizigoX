import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../config/env.js';
import { unprocessable } from './errors.js';

const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export interface StoredObject {
  provider: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  originalFilename: string | null;
}

export interface FileStorage {
  put(input: {
    organizationId: string;
    buffer: Buffer;
    contentType: string;
    filename?: string;
  }): Promise<StoredObject>;
  get(storageKey: string): Promise<{ buffer: Buffer; contentType: string }>;
}

class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  async put(input: {
    organizationId: string;
    buffer: Buffer;
    contentType: string;
    filename?: string;
  }): Promise<StoredObject> {
    const id = randomUUID();
    const extension = extensionFor(input.contentType, input.filename);
    const storageKey = `${input.organizationId}/${id}${extension}`;
    const destination = path.join(this.root, storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.buffer);
    return {
      provider: 'local',
      storageKey,
      contentType: input.contentType,
      byteSize: input.buffer.byteLength,
      checksumSha256: createHash('sha256').update(input.buffer).digest('hex'),
      originalFilename: sanitizeFilename(input.filename) ?? null,
    };
  }

  async get(storageKey: string): Promise<{ buffer: Buffer; contentType: string }> {
    const resolved = path.resolve(this.root, storageKey);
    const root = path.resolve(this.root);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      throw unprocessable('Invalid storage key');
    }
    const buffer = await readFile(resolved);
    return { buffer, contentType: contentTypeFor(storageKey) };
  }
}

class UnconfiguredStorage implements FileStorage {
  constructor(private readonly reason: string) {}

  async put(): Promise<StoredObject> {
    throw unprocessable(this.reason);
  }

  async get(): Promise<{ buffer: Buffer; contentType: string }> {
    throw unprocessable(this.reason);
  }
}

export function getFileStorage(): FileStorage {
  const env = getEnv();
  if (env.STORAGE_PROVIDER === 'local') {
    return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  }
  if (env.STORAGE_PROVIDER === 's3') {
    return new UnconfiguredStorage(
      'S3-compatible object storage is configured in environment variables but the adapter is not connected yet. Keep STORAGE_PROVIDER=local until an S3 client is wired with the documented credentials.',
    );
  }
  return new UnconfiguredStorage(
    'File storage is not configured. Attachments cannot be stored until a storage provider is set.',
  );
}

export function parseDataUrl(value: string, maxBytes = 1_500_000) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match) {
    throw unprocessable('Evidence must be a base64 data URL');
  }
  const contentType = match[1] ?? 'application/octet-stream';
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw unprocessable('Attached file type is not allowed');
  }
  const buffer = Buffer.from(match[2] ?? '', 'base64');
  if (!buffer.byteLength) {
    throw unprocessable('Attached file was empty');
  }
  if (buffer.byteLength > maxBytes) {
    throw unprocessable(`Attached file exceeds ${Math.floor(maxBytes / 1000)} KB`);
  }
  return { contentType, buffer };
}

function sanitizeFilename(filename?: string) {
  if (!filename) {
    return undefined;
  }
  const base = path
    .basename(filename)
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
  return base || undefined;
}

function extensionFor(contentType: string, filename?: string) {
  const fromName = sanitizeFilename(filename)?.includes('.')
    ? path.extname(sanitizeFilename(filename) ?? '')
    : '';
  if (fromName && fromName.length <= 8) {
    return fromName;
  }
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'application/pdf') return '.pdf';
  return '.bin';
}

function contentTypeFor(storageKey: string) {
  const ext = path.extname(storageKey).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}
