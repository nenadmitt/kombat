export { WalletNetwork } from '@gaming-platform/core';

export enum WalletOrigin {
  // The key stayed on the user's device.
  Platform = 0,
  // The user's own wallet, connected via SIWE.
  Imported = 1,
  // The key is held here, encrypted.
  Embedded = 2,
}
