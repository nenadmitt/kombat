/**
 * The lobby-bot roster. Checked in rather than generated so the server that
 * seeds these accounts and the runner that signs in as them agree on exactly
 * who exists, without a shared database or a handover file.
 *
 * Usernames read like players on purpose: a lobby where every name shares one
 * pattern reads as generated. All satisfy the server's rule, ^[a-zA-Z0-9_]{3,20}$.
 */
export type BotAccount = {
  username: string;
  email: string;
};

const HANDLES = [
  'mike_p',
  'Jenna94',
  'oldwolf77',
  'tomkarlsen',
  'bexx',
  'Danno_23',
  'quietstorm',
  'lu_ci',
  'mattheww',
  'Sara_K',
  'pjotr',
  'nightowl88',
  'grimsby',
  'ellamae',
  'RudyV',
  'tinkerbell99',
  'markos',
  'Ana_Bee',
  'shortfuse',
  'leonid_k',
] as const;

/** The domain is never delivered to; these accounts sign in server-side. */
export const BOT_EMAIL_DOMAIN = 'bots.kombat.local';

export function botEmailFor(username: string): string {
  return `bot-${username.toLowerCase()}@${BOT_EMAIL_DOMAIN}`;
}

export const BOT_ACCOUNTS: BotAccount[] = HANDLES.map(username => ({
  username,
  email: botEmailFor(username),
}));

export function isBotEmail(email: string | null): boolean {
  return email !== null && email.endsWith(`@${BOT_EMAIL_DOMAIN}`);
}
