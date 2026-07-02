import { randomInt } from 'crypto';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456780';

/** Cryptographically random 8-letter login token, e.g. "KQPXWMZR". */
export function generateLoginToken(): string {
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += LETTERS[randomInt(LETTERS.length)];
  }
  return token;
}
