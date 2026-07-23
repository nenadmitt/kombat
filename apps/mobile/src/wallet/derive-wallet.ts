import { bytesToHex, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

/** Re-derives the private key from a mnemonic - same derivation the server uses. */
export function derivePrivateKeyFromMnemonic(mnemonic: string): string {
  const account = mnemonicToAccount(mnemonic);
  const privateKeyBytes = account.getHdKey().privateKey;
  if (!privateKeyBytes) {
    throw new Error('Failed to derive a private key from the mnemonic');
  }
  return bytesToHex(privateKeyBytes);
}

/** The wallet's EVM address, recovered locally from the Keychain-stored key -
 *  lets the Wallet tab stand up with no server round-trip. */
export function deriveAddressFromPrivateKey(privateKey: string): string {
  return privateKeyToAccount(privateKey as Hex).address;
}
