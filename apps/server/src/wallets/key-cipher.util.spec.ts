import { randomBytes } from 'crypto';

import {
  decryptPrivateKey,
  encryptPrivateKey,
  KEY_BYTES,
  parseEncryptionKey,
} from './key-cipher.util';

const KEY = randomBytes(KEY_BYTES);
const PRIVATE_KEY =
  '0x4c0883a69102937d6231471b5dbb6204fe512961708279e2b1f0a0b7d0f5b1a3';

describe('key-cipher', () => {
  it('round-trips a private key', () => {
    const stored = encryptPrivateKey(PRIVATE_KEY, KEY);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(PRIVATE_KEY);
    expect(decryptPrivateKey(stored, KEY)).toBe(PRIVATE_KEY);
  });

  it('gives a different ciphertext each time (fresh IV)', () => {
    expect(encryptPrivateKey(PRIVATE_KEY, KEY)).not.toBe(
      encryptPrivateKey(PRIVATE_KEY, KEY),
    );
  });

  it('refuses to decrypt with the wrong key', () => {
    const stored = encryptPrivateKey(PRIVATE_KEY, KEY);
    expect(() => decryptPrivateKey(stored, randomBytes(KEY_BYTES))).toThrow();
  });

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    const stored = encryptPrivateKey(PRIVATE_KEY, KEY);
    const payload = Buffer.from(stored.slice('v1:'.length), 'base64');
    payload[payload.length - 1] ^= 0xff;
    expect(() =>
      decryptPrivateKey(`v1:${payload.toString('base64')}`, KEY),
    ).toThrow();
  });

  it('rejects an unknown version prefix', () => {
    expect(() => decryptPrivateKey('v2:AAAA', KEY)).toThrow(
      /Unsupported encrypted key format/,
    );
  });

  describe('parseEncryptionKey', () => {
    it('accepts a 32-byte base64 key', () => {
      expect(parseEncryptionKey(KEY.toString('base64'))).toEqual(KEY);
    });

    it('rejects a missing key', () => {
      expect(() => parseEncryptionKey(undefined)).toThrow(/not set/);
    });

    it('rejects a key of the wrong length', () => {
      expect(() => parseEncryptionKey(randomBytes(16).toString('base64'))).toThrow(
        /32 bytes/,
      );
    });

    it('rejects an all-zero placeholder key', () => {
      expect(() =>
        parseEncryptionKey(Buffer.alloc(KEY_BYTES).toString('base64')),
      ).toThrow(/all zeroes/);
    });
  });
});
