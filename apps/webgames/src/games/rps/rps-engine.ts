import type { RpsEndReason, RpsMove } from '@gaming-platform/core';

export type RpsStage = 'choosing' | 'revealing';

export type RpsPlayProps = {
  opponent: { name: string; initial: string; online: boolean };
  myOnline: boolean;
  round: number;
  myScore: number;
  opponentScore: number;
  myMove: RpsMove | null;
  opponentLocked: boolean;
  stage: RpsStage;
  reveal: {
    myMove: RpsMove | null;
    opponentMove: RpsMove | null;
    result: 'win' | 'loss' | 'tie';
    headline: string;
  } | null;
  roundDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: RpsEndReason | null;
  onLock: (move: RpsMove) => void;
  onNextRound: () => void;
  onTimerExpire?: () => void;
};

export type RpsEngine = {
  phase: 'waiting' | 'play';
  waitingError?: string | null;
  forfeit: () => void;
  playProps: RpsPlayProps;
};
