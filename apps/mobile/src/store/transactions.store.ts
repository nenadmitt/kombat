import type { Address, Hex } from 'viem';
import { create } from 'zustand';

import { getPublicClient, VIEM_CHAIN } from '../wallet/rpc';
import type { BalanceChainId, TokenSymbol } from '../wallet/tokens';

export const REQUIRED_CONFIRMATIONS = 12;
const POLL_MS = 3000;

export type TxStatus = 'pending' | 'success' | 'failed';

export type WalletTx = {
  hash: Hex;
  chainId: BalanceChainId;
  tokenSymbol: TokenSymbol;
  /** Human amount, e.g. "250.00". */
  amount: string;
  to: Address;
  /** ENS name, when the recipient was entered as one. */
  toLabel?: string;
  status: TxStatus;
  confirmations: number;
  requiredConfirmations: number;
  explorerUrl: string;
  explorerName: string;
  createdAt: number;
};

type TrackParams = {
  hash: Hex;
  chainId: BalanceChainId;
  tokenSymbol: TokenSymbol;
  amount: string;
  to: Address;
  toLabel?: string;
};

type TransactionsState = {
  txs: WalletTx[];
  /** Records a freshly-sent tx and starts polling it to completion. */
  track: (params: TrackParams) => void;
};

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  txs: [],

  track: params => {
    const explorer = VIEM_CHAIN[params.chainId].blockExplorers?.default;
    const tx: WalletTx = {
      ...params,
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: REQUIRED_CONFIRMATIONS,
      explorerUrl: explorer ? `${explorer.url}/tx/${params.hash}` : '',
      explorerName: explorer?.name ?? 'Explorer',
      createdAt: Date.now(),
    };
    set(state => ({
      txs: [tx, ...state.txs.filter(t => t.hash !== params.hash)],
    }));
    void poll(params.hash, params.chainId, set);
  },
}));

function patch(
  set: (fn: (s: TransactionsState) => Partial<TransactionsState>) => void,
  hash: Hex,
  changes: Partial<WalletTx>,
) {
  set(state => ({
    txs: state.txs.map(t => (t.hash === hash ? { ...t, ...changes } : t)),
  }));
}

async function poll(
  hash: Hex,
  chainId: BalanceChainId,
  set: (fn: (s: TransactionsState) => Partial<TransactionsState>) => void,
) {
  const client = getPublicClient(chainId);
  try {
    const confirmations = Number(
      await client.getTransactionConfirmations({ hash }),
    );
    if (confirmations >= 1) {
      const receipt = await client
        .getTransactionReceipt({ hash })
        .catch(() => null);
      if (receipt && receipt.status === 'reverted') {
        patch(set, hash, { status: 'failed', confirmations });
        return;
      }
      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        patch(set, hash, {
          status: 'success',
          confirmations: REQUIRED_CONFIRMATIONS,
        });
        return;
      }
    }
    patch(set, hash, { confirmations });
  } catch {
    // tx not yet propagated / transient RPC error — keep polling.
  }
  timers.set(
    hash,
    setTimeout(() => void poll(hash, chainId, set), POLL_MS),
  );
}
