// Checked in so the seeding server and the bot runner agree on who exists without sharing a database.
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

/** Never receives mail; these accounts sign in server-side. */
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
