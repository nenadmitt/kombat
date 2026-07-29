import type { RpsEndReason, RpsMove } from '@gaming-platform/core';

/** How the arena is currently presenting the round. */
export type RpsStage = 'choosing' | 'revealing';

export type RpsPlayProps = {
  opponent: { name: string; initial: string; online: boolean };
  myOnline: boolean;
  round: number;
  myScore: number;
  opponentScore: number;
  /** My locked move for this round (drives the "YOUR PICK" arena), or null. */
  myMove: RpsMove | null;
  /** Whether the opponent has locked (their move stays hidden until reveal). */
  opponentLocked: boolean;
  stage: RpsStage;
  /** During 'revealing': both moves + who won the round. */
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
  /** Pick a move for this round (no-op once locked). */
  onLock: (move: RpsMove) => void;
  /** Dismiss the reveal and move to the next round's pick UI. */
  onNextRound: () => void;
  onTimerExpire?: () => void;
};

/**
 * A Triple Cut engine drives the match and exposes it as play-screen props.
 * Both the local bot demo and the multiplayer socket implement this.
 */
export type RpsEngine = {
  phase: 'waiting' | 'play';
  /** Why the snapshot has not landed yet - shown under the waiting
   *  spinner so a stuck load is never a mute hang. */
  waitingError?: string | null;
  forfeit: () => void;
  playProps: RpsPlayProps;
};
