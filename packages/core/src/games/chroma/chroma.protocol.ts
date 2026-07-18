import type {
  ChromaCard,
  ChromaDirection,
  ChromaEndReason,
  ChromaSeat,
  ChromaStage,
  ChromaSuit,
} from './chroma.types';

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';

/**
 * Socket event names + payload types shared by the server gateway and the
 * mobile client. Hands are hidden information: channel broadcasts only ever
 * carry hand COUNTS; a player's actual cards travel solely on the
 * caller-only `hand` push.
 */
export const CHROMA_EVENTS = {
  // client -> server
  enter: 'chroma:enter',
  play: 'chroma:play',
  draw: 'chroma:draw',
  pass: 'chroma:pass',
  pickColor: 'chroma:pick-color',
  forfeit: 'chroma:forfeit',
  // server -> game channel
  played: 'chroma:played',
  drew: 'chroma:drew',
  passed: 'chroma:passed',
  colorPicked: 'chroma:color-picked',
  turnTimeout: 'chroma:turn-timeout',
  eliminated: 'chroma:eliminated',
  presence: 'chroma:presence',
  ended: 'chroma:ended',
  // server -> caller only
  hand: 'chroma:hand',
  error: 'chroma:error',
} as const;

// --- client -> server payloads ------------------------------------------------

export type ChromaEnterPayload = {
  roomId: string;
};

export type ChromaPlayPayload = {
  roomId: string;
  /** Index into the player's own hand. */
  handIndex: number;
  /** SOLO armed with this play - required when the play leaves one card. */
  solo: boolean;
};

export type ChromaDrawPayload = {
  roomId: string;
};

/** End the turn after drawing a playable card the player chose to keep. */
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

// --- shared payload fragments -------------------------------------------------

/** The public table state every broadcast refreshes. */
export type ChromaTableState = {
  /** Cards held per user (never the cards themselves). */
  handCounts: Record<string, number>;
  discardTop: ChromaCard;
  /** Colour that must be matched (wild plays set it via the pick). */
  activeSuit: ChromaSuit;
  direction: ChromaDirection;
  drawPileCount: number;
  stage: ChromaStage;
  /** Who owes the colour pick (stage 'pick-color'), else null. */
  pendingColorUserId: string | null;
  nextTurnUserId: string;
  /** Epoch ms when the current turn times out. */
  turnDeadline: number;
  winnerUserId: string | null;
};

// --- server -> game channel payloads -----------------------------------------

export type ChromaPlayedPayload = ChromaTableState & {
  byUserId: string;
  card: ChromaCard;
  /** SOLO armed on a play down to one card (flashes the banner). */
  soloCalled: boolean;
  /** Penalty draws applied for reaching one card without arming SOLO. */
  soloPenaltyDraws: number;
};

export type ChromaDrewPayload = ChromaTableState & {
  byUserId: string;
  count: number;
  /** The drawer may still act (their drawn card was playable). */
  drawerMayAct: boolean;
};

export type ChromaPassedPayload = ChromaTableState & {
  byUserId: string;
};

export type ChromaColorPickedPayload = ChromaTableState & {
  byUserId: string;
  suit: ChromaSuit;
  /** Forced draws applied to the victim as part of the resolved wild. */
  victimUserId: string | null;
  victimDraws: number;
};

export type ChromaTurnTimeoutPayload = ChromaTableState & {
  timedOutUserId: string;
  timeouts: Record<string, number>;
  /** The timed-out player force-drew this many cards (0 when piles empty). */
  forcedDraws: number;
  /** Set when this timeout eliminated the player (MAX_TIMEOUTS reached). */
  eliminatedUserId: string | null;
};

/** A player forfeited (left) mid-match and was eliminated. */
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

// --- server -> caller only ----------------------------------------------------

/** The caller's own full hand - pushed on enter and whenever it changes. */
export type ChromaHandPayload = {
  cards: ChromaCard[];
};

export type ChromaErrorPayload = {
  message: string;
};

// --- REST resume state (personalized per requester) --------------------------

export type ChromaPhase = 'play' | 'over';

export type ChromaRoomState = {
  roomId: string;
  phase: ChromaPhase;
  /** Seats in join order (creator first). */
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
  /** Set (for the requester, on their turn) after drawing: only this hand
   *  index may be played, or the turn passed. Null otherwise. */
  myDrawnIndex: number | null;
  eliminatedUserIds: string[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  winnerUserId: string | null;
  endReason: ChromaEndReason | null;
  /** Epoch ms when the current turn times out (null once over). */
  turnDeadline: number | null;
};
