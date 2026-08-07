import type { RpsEndReason, RpsMove } from '@gaming-platform/core';

export type RpsStage = 'choosing' | 'revealing';

export type RpsPlayProps = {
  opponent: { name: string; initial: string; online: boolean };
  myOnline: boolean;
  round: number;
  myScore: number;
  opponentScore: number;
  /** My locked move for this round, or null. */
  myMove: RpsMove | null;
  /** Whether the opponent has locked (their move stays hidden until reveal). */
  opponentLocked: boolean;
  stage: RpsStage;
  reveal: {
    myMove: RpsMove | null;
    opponentMove: RpsMove | null;
    result: 'win' | 'loss' | 'tie';
    headline: string;
  } | null;
  /** Epoch ms the round's lock-in ends (null while revealing / over). */
  roundDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: RpsEndReason | null;
  onLock: (move: RpsMove) => void;
  onNextRound: () => void;
  onTimerExpire?: () => void;
};

/**
 * A Triple Cut engine drives the match and exposes it as board props. The
 * local bot demo and the multiplayer socket both implement this, so one board
 * component serves both.
 */
export type RpsEngine = {
  phase: 'waiting' | 'play';
  /** Why the snapshot has not landed yet, so a stuck load is never mute. */
  waitingError?: string | null;
  forfeit: () => void;
  playProps: RpsPlayProps;
};
