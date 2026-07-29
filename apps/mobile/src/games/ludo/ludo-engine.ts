import type {
  LudoColor,
  LudoEndReason,
  LudoStage,
  LudoTokens,
} from '@gaming-platform/core';

/** One seat as the play screen renders it (HUD card + board color). */
export type LudoSeatView = {
  userId: string;
  color: LudoColor;
  name: string;
  initial: string;
  isMe: boolean;
  online: boolean;
  eliminated: boolean;
  /** Tokens brought home (the HUD's "n/4 home"). */
  homeCount: number;
};

export type LudoPlayProps = {
  seats: LudoSeatView[];
  tokens: LudoTokens;
  eliminatedColors: LudoColor[];
  myColor: LudoColor;
  /** Whose turn (null once over). */
  turnColor: LudoColor | null;
  myTurn: boolean;
  stage: LudoStage;
  /** Last rolled value - stays on the die face until the next roll. */
  die: number | null;
  /** Bumps on every roll (two equal values in a row still re-animate). */
  rollId: number;
  /** My movable token indices while I must pick one (else empty). */
  movableTokens: number[];
  /** Transient event line ("Three sixes - turn lost", "Captured Green!"). */
  notice: string | null;
  /** Epoch ms the current turn ends (null when over). */
  turnDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: LudoEndReason | null;
  winnerName: string | null;
  /** Opposing pawns I sent home (result-screen stat). */
  myCaptures: number;
  onRoll: () => void;
  onMoveToken: (tokenIndex: number) => void;
  /** Demo enforces its own timeouts; multiplayer leaves it to the server. */
  onTimerExpire?: () => void;
};

/**
 * A Ludo engine drives the match state and exposes it as play-screen props.
 * Both the local bot demo and the multiplayer socket implement this, so
 * `LudoGame` and the pure-UI screen don't care which is in use.
 */
export type LudoEngine = {
  /** 'waiting' while the multiplayer snapshot loads; the demo starts in play. */
  phase: 'waiting' | 'play';
  /** Why the snapshot has not landed yet - shown under the waiting
   *  spinner so a stuck load is never a mute hang. */
  waitingError?: string | null;
  forfeit: () => void;
  playProps: LudoPlayProps;
};
