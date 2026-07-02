import { bytesToHex } from 'viem';
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';

export interface GeneratedEthereumWallet {
  mnemonic: string;
  address: string;
  privateKey: string;
}

/** Generates a fresh BIP-39 mnemonic (12 words) and derives an Ethereum account from it. */
export function generateEthereumWallet(): GeneratedEthereumWallet {
  const mnemonic = generateMnemonic(english);
  const account = mnemonicToAccount(mnemonic);

  const privateKeyBytes = account.getHdKey().privateKey;
  if (!privateKeyBytes) {
    throw new Error('Failed to derive a private key from the mnemonic');
  }

  return {
    mnemonic,
    address: account.address,
    privateKey: bytesToHex(privateKeyBytes),
  };
}
