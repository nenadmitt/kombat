// WalletNetwork is shared with the mobile client — defined once in
// @gaming-platform/core, re-exported here so existing server imports
// (`from '../db/types/wallet'`) don't need to change.
export { WalletNetwork } from '@gaming-platform/core';

/** How the wallet came to exist, and who holds its key. Stored as smallint. */
export enum WalletOrigin {
  /** Generated for a mobile user; the key stayed on their device. */
  Platform = 0,
  /** The user's own wallet, connected via SIWE. */
  Imported = 1,
  /** Generated for a web user; the key is held here, encrypted. */
  Embedded = 2,
}
