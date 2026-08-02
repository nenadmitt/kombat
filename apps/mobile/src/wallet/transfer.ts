import {
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { alchemyRpcUrl, VIEM_CHAIN } from './rpc';
import type { BalanceChainId, Token } from './tokens';
import { getWalletSecret } from './wallet-keychain';

type TransferParams = {
  /** Whose key signs this - the secret is stored per account. */
  userId: string;
  chainId: BalanceChainId;
  token: Token;
  to: Address;
  /** Human-readable amount, e.g. "12.5". */
  amount: string;
};

/** Signs and broadcasts a native or ERC-20 transfer, returning the tx hash. */
export async function sendTransfer({
  userId,
  chainId,
  token,
  to,
  amount,
}: TransferParams): Promise<Hex> {
  const secret = await getWalletSecret(userId);
  if (!secret) {
    throw new Error('Wallet key not found on this device');
  }

  const account = privateKeyToAccount(secret.privateKey as Hex);
  const client = createWalletClient({
    account,
    chain: VIEM_CHAIN[chainId],
    transport: http(alchemyRpcUrl(chainId)),
  });

  if (token.native) {
    return client.sendTransaction({ to, value: parseEther(amount) });
  }

  if (!token.address) {
    throw new Error(`${token.symbol} isn't available on this network`);
  }

  return client.writeContract({
    address: token.address,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, parseUnits(amount, token.decimals)],
  });
}
