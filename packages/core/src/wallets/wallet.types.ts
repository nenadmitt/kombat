/** Which chain the wallet is on. Stored server-side as smallint (0/1), not a Postgres enum. */
export enum WalletNetwork {
  Ethereum = 0,
  Solana = 1,
}

export type WalletSummary = {
  address: string;
  network: WalletNetwork;
};

export type CreateWalletResponse = {
  address: string;
  mnemonic: string;
};

/** GET /users/lookup: resolve an address, ENS name, or username to a player. */
export type RecipientLookup =
  | { found: false }
  | {
      found: true;
      username: string | null;
      ensName: string | null;
      /** The player's platform wallet, where staked funds are credited. */
      address: string;
    };
