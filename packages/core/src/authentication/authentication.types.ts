export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

export type ExchangeTokenResponse = AuthSession;

export type UserProfile = {
  id: string;
  /** Null for wallet-only accounts, which sign in with SIWE instead. */
  email: string | null;
  username: string | null;
  /** Null until minted, and forever if the mint found no free label. */
  ensName: string | null;
  referralCode: string | null;
  referredByUsername: string | null;
};

export type PublicUserProfile = {
  id: string;
  username: string | null;
  /** Reserved: always null until avatars ship. */
  avatarUrl: string | null;
};
