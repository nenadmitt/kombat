import { bytesToHex, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export function derivePrivateKeyFromMnemonic(mnemonic: string): string {
  const account = mnemonicToAccount(mnemonic);
  const privateKeyBytes = account.getHdKey().privateKey;
  if (!privateKeyBytes) {
    throw new Error('Failed to derive a private key from the mnemonic');
  }
  return bytesToHex(privateKeyBytes);
}

export function deriveAddressFromPrivateKey(privateKey: string): string {
  return privateKeyToAccount(privateKey as Hex).address;
}
