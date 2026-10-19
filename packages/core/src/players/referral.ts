// Stored on the user rather than derived from the username, so a shared code never changes.

/** Drops easily misread glyphs (I, O, 0, 1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 8;

/** Case-sensitive: normalise input first. */
export const REFERRAL_CODE_PATTERN = new RegExp(
  `^[${CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`,
);

export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidReferralCode(input: string): boolean {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCode(input));
}

/** Uniqueness is enforced by the column; the caller retries on collision. */
export function generateReferralCode(
  rand: () => number = Math.random,
): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return code;
}
