import { bytesToHex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

/** Re-derives the private key from a mnemonic - same derivation the server uses. */
export function derivePrivateKeyFromMnemonic(mnemonic: string): string {
  const account = mnemonicToAccount(mnemonic);
  const privateKeyBytes = account.getHdKey().privateKey;
  if (!privateKeyBytes) {
    throw new Error('Failed to derive a private key from the mnemonic');
  }
  return bytesToHex(privateKeyBytes);
}
