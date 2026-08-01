/**
 * A logged-in session. The access token is short-lived and sent as the bearer
 * on every request; the refresh token is long-lived, single-use, and buys a
 * whole new pair. Both must be stored somewhere secure (the mobile client keeps
 * them in the Keychain/Keystore) - the refresh token is a login credential in
 * its own right.
 */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

export type ExchangeTokenResponse = AuthSession;

export type UserProfile = {
  id: string;
  email: string;
  username: string | null;
  /** <label>.playkombat.xyz, derived from the first username. Null until it
   *  is minted, and null forever if the mint could not find a free label. */
  ensName: string | null;
  /** This user's own shareable code; null until they pick a username. */
  referralCode: string | null;
  /** Username of whoever referred them, if anyone. */
  referredByUsername: string | null;
};

/** What anyone may see about a user (batch-resolved for match rosters,
 *  history, etc). No email. Usernames effectively never change, so clients
 *  cache these aggressively. */
export type PublicUserProfile = {
  id: string;
  username: string | null;
  /** Always null until avatars ship - the shape is reserved for them. */
  avatarUrl: string | null;
};
