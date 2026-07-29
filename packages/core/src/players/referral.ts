/**
 * Referral codes are stored on the user, not derived from the username -
 * a username can in principle change, and a code that changes underneath
 * people who already shared it would break attribution.
 */

/** Codes are uppercase A-Z / 2-9, dropping the glyphs people misread. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 8;

/** Anchored, case-insensitive: input is normalised before it is checked. */
export const REFERRAL_CODE_PATTERN = new RegExp(
  `^[${CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`,
);

/** Trim, uppercase, and drop separators people paste in ("ab-cd 12"). */
export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidReferralCode(input: string): boolean {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCode(input));
}

/**
 * Generate a code from an injected randomness source, so the server can pass
 * a crypto-backed one. Uniqueness is enforced by the column, not here - the
 * caller retries on collision.
 */
export function generateReferralCode(
  rand: () => number = Math.random,
): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return code;
}
