import type {
  ChromaCard,
  ChromaDirection,
  ChromaEndReason,
  ChromaStage,
  ChromaSuit,
} from '@gaming-platform/core';

/** One seat as the play screen renders it (me included, join order). */
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
  /** After I draw a playable card: only this index may be played (or pass). */
  myDrawnIndex: number | null;
  /** I played a wild and owe the colour pick (opens the Prism sheet). */
  pickingColor: boolean;
  /** One-line last-event banner ("Kraken played Jade +2 - you draw 2"). */
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

/**
 * A Chroma engine drives the match and exposes it as play-screen props. The
 * local bot demo and the multiplayer socket implement the same shape.
 */
export type ChromaEngine = {
  phase: 'waiting' | 'play';
  forfeit: () => void;
  playProps: ChromaPlayProps;
};
