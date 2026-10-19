import type {
  LudoColor,
  LudoEndReason,
  LudoStage,
  LudoTokens,
} from '@gaming-platform/core';

export type LudoSeatView = {
  userId: string;
  color: LudoColor;
  name: string;
  initial: string;
  isMe: boolean;
  online: boolean;
  eliminated: boolean;
  homeCount: number;
};

export type LudoPlayProps = {
  seats: LudoSeatView[];
  tokens: LudoTokens;
  eliminatedColors: LudoColor[];
  myColor: LudoColor;
  turnColor: LudoColor | null;
  myTurn: boolean;
  stage: LudoStage;
  die: number | null;
  rollId: number;
  movableTokens: number[];
  notice: string | null;
  turnDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: LudoEndReason | null;
  winnerName: string | null;
  myCaptures: number;
  onRoll: () => void;
  onMoveToken: (tokenIndex: number) => void;
  onTimerExpire?: () => void;
};

export type LudoEngine = {
  phase: 'waiting' | 'play';
  waitingError?: string | null;
  forfeit: () => void;
  playProps: LudoPlayProps;
};
