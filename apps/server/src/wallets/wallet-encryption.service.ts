import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { ConfigurationService } from '../configuration/configuration.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM

/**
 * Encrypts wallet private keys at rest using a single master key from env
 * (WALLET_ENCRYPTION_KEY, 32 bytes as hex). Output is a single string —
 * "iv:authTag:ciphertext", each hex-encoded — so it fits in one DB column.
 */
@Injectable()
export class WalletEncryptionService {
  private readonly key: Buffer;

  constructor(configService: ConfigurationService) {
    this.key = Buffer.from(configService.WALLET_ENCRYPTION_KEY, 'hex');
    if (this.key.length !== 32) {
      throw new Error(
        `WALLET_ENCRYPTION_KEY must be 32 bytes (64 hex chars); got ${this.key.length} bytes`,
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  decrypt(encoded: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error('Malformed encrypted value');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
