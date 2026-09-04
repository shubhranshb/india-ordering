import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function toKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must be 32 bytes of hex (openssl rand -hex 32)');
  }
  return key;
}

/** Seals a Playwright storageState blob. Format: iv.authTag.ciphertext, all base64url. */
export function seal(plaintext: string, hexKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, toKey(hexKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url')).join('.');
}

export function open(sealed: string, hexKey: string): string {
  const [ivB64, tagB64, dataB64] = sealed.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed sealed payload');

  const iv = strictDecode(ivB64);
  const tag = strictDecode(tagB64);
  const data = strictDecode(dataB64);

  const decipher = createDecipheriv(ALGORITHM, toKey(hexKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Buffer silently drops invalid base64url characters, which would hide tampering. */
function strictDecode(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('Malformed sealed payload');
  return decoded;
}

/** Constant-time compare for webhook secrets and bearer tokens. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
