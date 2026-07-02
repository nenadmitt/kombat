/** How the wallet came to exist. Stored as smallint (0/1), not a Postgres enum. */
export enum WalletOrigin {
  Platform = 0,
  Imported = 1,
}

/** Which chain the wallet is on. Stored as smallint (0/1), not a Postgres enum. */
export enum WalletNetwork {
  Ethereum = 0,
  Solana = 1,
}
