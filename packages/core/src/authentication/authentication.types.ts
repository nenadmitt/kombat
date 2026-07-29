export type ExchangeTokenResponse = {
  accessToken: string;
};

export type UserProfile = {
  id: string;
  email: string;
  username: string | null;
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
