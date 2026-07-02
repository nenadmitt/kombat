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
