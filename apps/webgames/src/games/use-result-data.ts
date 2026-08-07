import {
  formatStakeAmount,
  STAKE_ASSET_SYMBOLS,
  winRate,
  type MatchHistoryEntry,
  type StakeAsset,
} from '@gaming-platform/core';
import { useEffect, useState } from 'react';

import { apiClient } from '../lib/api';
import { usePotStore } from '../store/pot.store';

/** Winner's cut of the two stakes, matching the server's settlement. */
const FEE_RATE = 0.05;

/** What every game's result screen needs on top of its own match state. */
export type ResultExtras = {
  onBack: () => void;
  onPlayAgain?: () => void;
  settlement?: ResultSettlement | null;
  /** Lifetime win rate, for the comparison bar. Null until it loads. */
  winRate?: number | null;
};

export type ResultSettlementRow = { label: string; value: string };

export type ResultSettlement = {
  eyebrow: string;
  /** Signed headline, e.g. "+228". */
  delta: string;
  symbol: string;
  rows: ResultSettlementRow[];
  potNow: string | null;
  /** Per-player stake, for the "Play again" button's label. */
  stakeLabel: string;
};

/**
 * The settled history row for a finished match. The server writes it after the
 * match ends, so it is not there the moment the result screen mounts - poll a
 * few times, backing off, before giving up and rendering without it.
 */
export function useMatchSettlement(
  roomId: string | null,
  over: boolean,
): MatchHistoryEntry | null {
  const [entry, setEntry] = useState<MatchHistoryEntry | null>(null);

  useEffect(() => {
    if (!roomId || !over) return;
    let alive = true;
    let attempt = 0;
    let timer = 0;

    async function poll() {
      try {
        const rows = await apiClient.getMatchHistory({ limit: 10 });
        const found = rows.find(row => row.roomId === roomId);
        if (!alive) return;
        if (found) {
          setEntry(found);
          return;
        }
      } catch {
        // A transient failure must not end the poll; the retry below covers it.
      }
      attempt += 1;
      if (!alive || attempt >= 6) return;
      timer = window.setTimeout(poll, 800 * attempt);
    }

    void poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [roomId, over]);

  return entry;
}

/**
 * Everything the result screen needs that does not come from the game itself:
 * the settled money panel and the lifetime win rate. A free match, a practice
 * match (no room) or an unsettled one simply gets no settlement.
 */
export function useResultExtras(
  roomId: string | null,
  over: boolean,
  opponentName: string,
): Pick<ResultExtras, 'settlement' | 'winRate'> {
  const entry = useMatchSettlement(roomId, over);
  const potNow = usePotBalance(entry?.stakeToken ?? null);
  const rate = useWinRate(over);
  return {
    settlement: buildSettlement(entry, opponentName, potNow),
    winRate: rate,
  };
}

/** The player's lifetime win rate, for the result screen's comparison bar. */
export function useWinRate(over: boolean): number | null {
  const [rate, setRate] = useState<number | null>(null);

  useEffect(() => {
    if (!over) return;
    let alive = true;
    apiClient
      .getMyStats()
      .then(stats => {
        if (alive) setRate(winRate(stats));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [over]);

  return rate;
}

/** The pot balance to show as "POT NOW", once the settlement has landed. */
export function usePotBalance(token: StakeAsset | null): string | null {
  const { balances, enabled } = usePotStore();
  if (token === null || !enabled) return null;
  return `${formatStakeAmount(balances.available[token] ?? '0', token)} ${
    STAKE_ASSET_SYMBOLS[token]
  }`;
}

const signed = (amount: bigint, token: StakeAsset): string => {
  const magnitude = formatStakeAmount(String(amount < 0n ? -amount : amount), token);
  return amount > 0n ? `+${magnitude}` : amount < 0n ? `-${magnitude}` : magnitude;
};

/**
 * Turn a settled history row into the result screen's money panel. Null for a
 * free match, which has no settlement to show.
 */
export function buildSettlement(
  entry: MatchHistoryEntry | null,
  opponentName: string,
  potNow: string | null,
): ResultSettlement | null {
  if (!entry || entry.stakeToken === null || entry.stakeAmount === null) {
    return null;
  }

  const token = entry.stakeToken;
  const stake = BigInt(entry.stakeAmount);
  const delta = BigInt(entry.prizeDelta ?? '0');
  const won = delta > 0n;
  const fee = won ? stake * 2n - (stake + delta) : 0n;

  return {
    eyebrow: won ? 'POT SETTLED' : delta === 0n ? 'STAKE RETURNED' : 'STAKE LOST',
    delta: signed(delta, token),
    symbol: STAKE_ASSET_SYMBOLS[token],
    rows: [
      { label: 'Your stake', value: formatStakeAmount(String(stake), token) },
      won
        ? { label: 'Opponent stake', value: formatStakeAmount(String(stake), token) }
        : {
            label: `Paid to ${opponentName}`,
            value: formatStakeAmount(String(stake), token),
          },
      {
        label: `Platform fee ${Math.round(FEE_RATE * 100)}%`,
        value: won ? signed(-fee, token) : '-',
      },
    ],
    potNow,
    stakeLabel: `${formatStakeAmount(String(stake), token)} ${STAKE_ASSET_SYMBOLS[token]}`,
  };
}
