import type {
  ChromaCard,
  ChromaDirection,
  ChromaEndReason,
  ChromaStage,
  ChromaSuit,
} from '@gaming-platform/core';

export type ChromaSeatView = {
  userId: string;
  name: string;
  initial: string;
  isMe: boolean;
  online: boolean;
  eliminated: boolean;
  cardCount: number;
  onTurn: boolean;
};

export type ChromaPlayProps = {
  seats: ChromaSeatView[];
  myHand: ChromaCard[];
  myTurn: boolean;
  stage: ChromaStage;
  activeSuit: ChromaSuit;
  discardTop: ChromaCard;
  drawPileCount: number;
  direction: ChromaDirection;
  myDrawnIndex: number | null;
  pickingColor: boolean;
  notice: string | null;
  turnDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: ChromaEndReason | null;
  winnerName: string | null;
  onPlay: (handIndex: number, solo: boolean) => void;
  onDraw: () => void;
  onPass: () => void;
  onPickColor: (suit: ChromaSuit) => void;
  onTimerExpire?: () => void;
};

export type ChromaEngine = {
  phase: 'waiting' | 'play';
  waitingError?: string | null;
  forfeit: () => void;
  playProps: ChromaPlayProps;
};
