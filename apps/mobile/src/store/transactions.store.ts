import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hex } from 'viem';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getPublicClient, VIEM_CHAIN } from '../wallet/rpc';
import type { BalanceChainId, TokenSymbol } from '../wallet/tokens';

export const REQUIRED_CONFIRMATIONS = 12;
const POLL_MS = 3000;
/** Give up polling this long after send; the tx may still land - the timeout
 *  state points the user at the explorer instead of spinning forever. */
const POLL_DEADLINE_MS = 30 * 60_000;

export type TxStatus = 'pending' | 'success' | 'failed' | 'timeout';

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
  /** Transactions grouped by chain, newest first. */
  byChain: Partial<Record<BalanceChainId, WalletTx[]>>;
  /** Records a freshly-sent tx and starts polling it to completion. */
  track: (params: TrackParams) => void;
};

/** Guards against double-polling the same hash within a session. */
const watching = new Set<string>();

export const useTransactionsStore = create<TransactionsState>()(
  persist(
    set => ({
      byChain: {},

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
          byChain: {
            ...state.byChain,
            [params.chainId]: [
              tx,
              ...(state.byChain[params.chainId] ?? []).filter(
                t => t.hash !== params.hash,
              ),
            ],
          },
        }));
        void poll(params.hash, params.chainId);
      },
    }),
    {
      name: 'wallet-transactions',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ byChain: state.byChain }),
      // On reload, re-check anything unresolved from a previous session. A
      // timed-out tx gets one fresh look - it may have landed since.
      onRehydrateStorage: () => state => {
        if (!state) return;
        for (const [chainId, txs] of Object.entries(state.byChain)) {
          for (const tx of txs ?? []) {
            if (tx.status === 'pending' || tx.status === 'timeout') {
              void poll(tx.hash, chainId as BalanceChainId);
            }
          }
        }
      },
    },
  ),
);

function patch(chainId: BalanceChainId, hash: Hex, changes: Partial<WalletTx>) {
  useTransactionsStore.setState(state => ({
    byChain: {
      ...state.byChain,
      [chainId]: (state.byChain[chainId] ?? []).map(t =>
        t.hash === hash ? { ...t, ...changes } : t,
      ),
    },
  }));
}

async function poll(hash: Hex, chainId: BalanceChainId) {
  if (watching.has(hash)) return;
  watching.add(hash);
  void step(hash, chainId);
}

async function step(hash: Hex, chainId: BalanceChainId) {
  const client = getPublicClient(chainId);
  try {
    // The receipt is the ground truth; getTransactionConfirmations returns 0
    // for any tx the RPC hasn't indexed, which used to pin mined withdrawals
    // on "pending" forever.
    const receipt = await client
      .getTransactionReceipt({ hash })
      .catch(() => null);
    if (receipt) {
      if (receipt.status === 'reverted') {
        patch(chainId, hash, { status: 'failed' });
        watching.delete(hash);
        return;
      }
      const tip = await client.getBlockNumber();
      const confirmations = Number(tip - receipt.blockNumber + 1n);
      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        patch(chainId, hash, {
          status: 'success',
          confirmations: REQUIRED_CONFIRMATIONS,
        });
        watching.delete(hash);
        return;
      }
      patch(chainId, hash, { confirmations: Math.max(confirmations, 0) });
    }
  } catch {
    // Transient RPC error - keep polling until the deadline below.
  }
  const tx = useTransactionsStore
    .getState()
    .byChain[chainId]?.find(t => t.hash === hash);
  if (tx && Date.now() - tx.createdAt > POLL_DEADLINE_MS) {
    patch(chainId, hash, { status: 'timeout' });
    watching.delete(hash);
    return;
  }
  setTimeout(() => void step(hash, chainId), POLL_MS);
}
