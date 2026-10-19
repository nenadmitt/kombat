import type {
  ChromaCard,
  ChromaDirection,
  ChromaEndReason,
  ChromaSeat,
  ChromaStage,
  ChromaSuit,
} from './chroma.types';

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';

// Hands are hidden: broadcasts carry only counts; cards travel solely on the caller-only `hand` push.
export const CHROMA_EVENTS = {
  enter: 'chroma:enter',
  play: 'chroma:play',
  draw: 'chroma:draw',
  pass: 'chroma:pass',
  pickColor: 'chroma:pick-color',
  forfeit: 'chroma:forfeit',
  played: 'chroma:played',
  drew: 'chroma:drew',
  passed: 'chroma:passed',
  colorPicked: 'chroma:color-picked',
  turnTimeout: 'chroma:turn-timeout',
  eliminated: 'chroma:eliminated',
  presence: 'chroma:presence',
  ended: 'chroma:ended',
  hand: 'chroma:hand',
  error: 'chroma:error',
} as const;

export type ChromaEnterPayload = {
  roomId: string;
};

export type ChromaPlayPayload = {
  roomId: string;
  handIndex: number;
  /** Required when the play leaves one card. */
  solo: boolean;
};

export type ChromaDrawPayload = {
  roomId: string;
};

export type ChromaPassPayload = {
  roomId: string;
};

export type ChromaPickColorPayload = {
  roomId: string;
  suit: ChromaSuit;
};

export type ChromaForfeitPayload = {
  roomId: string;
};

export type ChromaTableState = {
  handCounts: Record<string, number>;
  discardTop: ChromaCard;
  activeSuit: ChromaSuit;
  direction: ChromaDirection;
  drawPileCount: number;
  stage: ChromaStage;
  pendingColorUserId: string | null;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

export type ChromaPlayedPayload = ChromaTableState & {
  byUserId: string;
  card: ChromaCard;
  soloCalled: boolean;
  soloPenaltyDraws: number;
};

export type ChromaDrewPayload = ChromaTableState & {
  byUserId: string;
  count: number;
  drawerMayAct: boolean;
};

export type ChromaPassedPayload = ChromaTableState & {
  byUserId: string;
};

export type ChromaColorPickedPayload = ChromaTableState & {
  byUserId: string;
  suit: ChromaSuit;
  victimUserId: string | null;
  victimDraws: number;
};

export type ChromaTurnTimeoutPayload = ChromaTableState & {
  timedOutUserId: string;
  timeouts: Record<string, number>;
  forcedDraws: number;
  eliminatedUserId: string | null;
};

export type ChromaEliminatedPayload = ChromaTableState & {
  userId: string;
};

export type ChromaPresencePayload = {
  userId: string;
  online: boolean;
};

export type ChromaEndedPayload = {
  winnerUserId: string;
  reason: ChromaEndReason;
};

export type ChromaHandPayload = {
  cards: ChromaCard[];
};

export type ChromaErrorPayload = {
  message: string;
};

export type ChromaPhase = 'play' | 'over';

export type ChromaRoomState = {
  roomId: string;
  phase: ChromaPhase;
  players: ChromaSeat[];
  myHand: ChromaCard[];
  handCounts: Record<string, number>;
  discardTop: ChromaCard;
  activeSuit: ChromaSuit;
  direction: ChromaDirection;
  drawPileCount: number;
  stage: ChromaStage;
  pendingColorUserId: string | null;
  turnUserId: string | null;
  /** After drawing, only this index may be played (or the turn passed). */
  myDrawnIndex: number | null;
  eliminatedUserIds: string[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  winnerUserId: string | null;
  endReason: ChromaEndReason | null;
  turnDeadline: number | null;
};
