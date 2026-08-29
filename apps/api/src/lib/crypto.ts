import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function createOpaqueToken() {
  return randomBytes(48).toString('hex');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
