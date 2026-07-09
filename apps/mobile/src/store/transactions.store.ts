import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hex } from 'viem';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
      // On reload, re-check anything still pending from a previous session.
      onRehydrateStorage: () => state => {
        if (!state) return;
        for (const [chainId, txs] of Object.entries(state.byChain)) {
          for (const tx of txs ?? []) {
            if (tx.status === 'pending') {
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
    const confirmations = Number(
      await client.getTransactionConfirmations({ hash }),
    );
    if (confirmations >= 1) {
      const receipt = await client
        .getTransactionReceipt({ hash })
        .catch(() => null);
      if (receipt && receipt.status === 'reverted') {
        patch(chainId, hash, { status: 'failed', confirmations });
        watching.delete(hash);
        return;
      }
      if (confirmations >= REQUIRED_CONFIRMATIONS) {
        patch(chainId, hash, {
          status: 'success',
          confirmations: REQUIRED_CONFIRMATIONS,
        });
        watching.delete(hash);
        return;
      }
    }
    patch(chainId, hash, { confirmations });
  } catch {
    // tx not yet propagated / transient RPC error — keep polling.
  }
  setTimeout(() => void step(hash, chainId), POLL_MS);
}
