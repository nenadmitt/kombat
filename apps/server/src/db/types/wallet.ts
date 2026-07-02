// WalletNetwork is shared with the mobile client — defined once in
// @gaming-platform/core, re-exported here so existing server imports
// (`from '../db/types/wallet'`) don't need to change.
export { WalletNetwork } from '@gaming-platform/core';

/** How the wallet came to exist. Stored as smallint (0/1), not a Postgres enum. */
export enum WalletOrigin {
  Platform = 0,
  Imported = 1,
}
