import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '../config/env.js';
import { unprocessable } from './errors.js';

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
      originalFilename: input.filename ?? null,
    };
  }
}

class UnconfiguredStorage implements FileStorage {
  async put(): Promise<StoredObject> {
    throw unprocessable(
      'File storage is not configured. Attachments cannot be stored until a storage provider is set.',
    );
  }
}

export function getFileStorage(): FileStorage {
  const env = getEnv();
  if (env.STORAGE_PROVIDER === 'local') {
    return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  }
  return new UnconfiguredStorage();
}

export function parseDataUrl(value: string, maxBytes = 1_500_000) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match) {
    throw unprocessable('Evidence must be a base64 data URL');
  }
  const contentType = match[1] ?? 'application/octet-stream';
  const buffer = Buffer.from(match[2] ?? '', 'base64');
  if (!buffer.byteLength) {
    throw unprocessable('Attached file was empty');
  }
  if (buffer.byteLength > maxBytes) {
    throw unprocessable(`Attached file exceeds ${Math.floor(maxBytes / 1000)} KB`);
  }
  return { contentType, buffer };
}

function extensionFor(contentType: string, filename?: string) {
  const fromName = filename?.includes('.') ? path.extname(filename) : '';
  if (fromName && fromName.length <= 8) {
    return fromName;
  }
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/jpeg') return '.jpg';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'application/pdf') return '.pdf';
  return '.bin';
}
