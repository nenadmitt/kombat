import {
  createWalletClient,
  erc20Abi,
  http,
  parseSignature,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { alchemyRpcUrl, getPublicClient, VIEM_CHAIN } from './rpc';
import type { BalanceChainId, Token } from './tokens';
import { getWalletSecret } from './wallet-keychain';

/** Only the deposit surface of StakePot.sol - the server owns withdrawals. */
const STAKE_POT_ABI = [
  {
    type: 'function',
    name: 'stakeNative',
    stateMutability: 'payable',
    inputs: [{ name: 'beneficiary', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'stakeWithPermit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
      {
        name: 'sig',
        type: 'tuple',
        components: [
          { name: 'deadline', type: 'uint256' },
          { name: 'v', type: 'uint8' },
          { name: 'r', type: 'bytes32' },
          { name: 's', type: 'bytes32' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

const PERMIT_TTL_SECONDS = 30 * 60;

type DepositParams = {
  /** Whose key signs this - the secret is stored per account. */
  userId: string;
  chainId: BalanceChainId;
  /** The StakePot contract, from GET /stake-pot/deposit-target. */
  pot: Address;
  token: Token;
  /** Human-readable amount, e.g. "12.5". */
  amount: string;
};

/**
 * Sign and broadcast a deposit from the device's own key.
 *
 * ERC-20s use `stakeWithPermit`, signed locally, so the deposit is one
 * transaction with no separate approve; falls back to approve + `stake` for a
 * token without EIP-2612. The returned hash is only the deposit - the pot
 * credit follows once the server's watcher sees enough confirmations.
 */
export async function depositToStakePot({
  userId,
  chainId,
  pot,
  token,
  amount,
}: DepositParams): Promise<Hex> {
  const secret = await getWalletSecret(userId);
  if (!secret) {
    throw new Error('Wallet key not found on this device');
  }
  const account = privateKeyToAccount(secret.privateKey as Hex);
  const chain = VIEM_CHAIN[chainId];
  const client = createWalletClient({
    account,
    chain,
    transport: http(alchemyRpcUrl(chainId)),
  });

  if (token.native) {
    return client.writeContract({
      address: pot,
      abi: STAKE_POT_ABI,
      functionName: 'stakeNative',
      args: [account.address],
      value: parseUnits(amount, token.decimals),
    });
  }

  if (!token.address) {
    throw new Error(`${token.symbol} isn't available on this network`);
  }
  const tokenAddress = token.address;
  const value = parseUnits(amount, token.decimals);

  const permit = await signPermit({
    chainId,
    account,
    token: tokenAddress,
    spender: pot,
    value,
  });
  if (permit) {
    return client.writeContract({
      address: pot,
      abi: STAKE_POT_ABI,
      functionName: 'stakeWithPermit',
      args: [account.address, tokenAddress, value, permit],
    });
  }

  // No permit support: approve first, then deposit. Two transactions, so the
  // wallet needs gas for both.
  const approval = await client.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [pot, value],
  });
  await getPublicClient(chainId).waitForTransactionReceipt({ hash: approval });

  return client.writeContract({
    address: pot,
    abi: STAKE_POT_ABI,
    functionName: 'stake',
    args: [account.address, tokenAddress, value],
  });
}

type PermitSig = { deadline: bigint; v: number; r: Hex; s: Hex };

/** An EIP-2612 permit, or null when the token doesn't support one. */
async function signPermit({
  chainId,
  account,
  token,
  spender,
  value,
}: {
  chainId: BalanceChainId;
  account: ReturnType<typeof privateKeyToAccount>;
  token: Address;
  spender: Address;
  value: bigint;
}): Promise<PermitSig | null> {
  const publicClient = getPublicClient(chainId);
  const permitAbi = [
    {
      type: 'function',
      name: 'nonces',
      stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'name',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'string' }],
    },
  ] as const;

  let name: string;
  let nonce: bigint;
  try {
    [name, nonce] = await Promise.all([
      publicClient.readContract({
        address: token,
        abi: permitAbi,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: token,
        abi: permitAbi,
        functionName: 'nonces',
        args: [account.address],
      }),
    ]);
  } catch {
    return null; // No nonces() - not an EIP-2612 token.
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_TTL_SECONDS);
  const signature = await account.signTypedData({
    domain: {
      name,
      version: '1', // OpenZeppelin ERC20Permit
      chainId: VIEM_CHAIN[chainId].id,
      verifyingContract: token,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner: account.address,
      spender,
      value,
      nonce,
      deadline,
    },
  });
  const parsed = parseSignature(signature);
  return {
    deadline,
    v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
    r: parsed.r,
    s: parsed.s,
  };
}
