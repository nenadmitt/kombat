export type ExchangeTokenResponse = {
  accessToken: string;
};

export type UserProfile = {
  id: string;
  email: string;
  username: string | null;
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
