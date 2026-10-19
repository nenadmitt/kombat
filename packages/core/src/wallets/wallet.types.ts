/** Stored server-side as smallint: never renumber. */
export enum WalletNetwork {
  Ethereum = 0,
  Solana = 1,
}

export type WalletSummary = {
  address: string;
  network: WalletNetwork;
  custodial: boolean;
};

export type CreateWalletResponse = {
  address: string;
  mnemonic: string;
};

export type RecipientLookup =
  | { found: false }
  | {
      found: true;
      username: string | null;
      ensName: string | null;
      address: string;
    };
