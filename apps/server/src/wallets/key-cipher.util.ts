import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * Authenticated encryption for custodial private keys. AES-256-GCM: the tag
 * makes a tampered ciphertext fail loudly instead of decrypting to garbage a
 * signer would then use.
 *
 * Stored form is `v1:<base64(iv | tag | ciphertext)>`. The version prefix is
 * the migration path to a KMS or per-user derived keys later, without a
 * schema change or a backfill.
 */
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
export const KEY_BYTES = 32;

/** Decodes and validates the configured key. Throws if it is unusable. */
export function parseEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error('W_ENCRYPT is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `W_ENCRYPT must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }
  // All-zero keys are the classic "we forgot to generate one" placeholder.
  if (timingSafeEqual(key, Buffer.alloc(KEY_BYTES))) {
    throw new Error('W_ENCRYPT must not be all zeroes');
  }
  return key;
}

export function encryptPrivateKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return `${VERSION}:${payload.toString('base64')}`;
}

export function decryptPrivateKey(stored: string, key: Buffer): string {
  const [version, encoded] = stored.split(':', 2);
  if (version !== VERSION || !encoded) {
    throw new Error(`Unsupported encrypted key format: ${version ?? 'none'}`);
  }
  const payload = Buffer.from(encoded, 'base64');
  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted key is truncated');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    payload.subarray(0, IV_BYTES),
  );
  decipher.setAuthTag(payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(payload.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
