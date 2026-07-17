/** Ludo player colors, in turn order (= track order = join order). */
export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export const LUDO_COLORS: readonly LudoColor[] = [
  'red',
  'green',
  'yellow',
  'blue',
];

/** A board cell in row/column form on the 15x15 grid. */
export type LudoCell = { row: number; col: number };

/**
 * A token's progress along its color's own path:
 * -1 = in base; 0..50 = on the shared track (absolute cell =
 * (start offset + progress) mod 52); 51..55 = own home column; 56 = home.
 */
export type LudoProgress = number;

/** Progress of every token, keyed by color (TOKENS_PER_PLAYER entries each). */
export type LudoTokens = Partial<Record<LudoColor, LudoProgress[]>>;

/** A seat in the match: which user plays which color. */
export type LudoPlayer = {
  userId: string;
  color: LudoColor;
};

/** Within a turn: waiting for the die, or for a token choice. */
export type LudoStage = 'roll' | 'move';

/** A capture produced by a move: whose token was sent back to base. */
export type LudoCapture = {
  color: LudoColor;
  tokenIndex: number;
};

/** Why a Ludo match ended (relative to the winner). */
export type LudoEndReason = 'complete' | 'forfeit' | 'timeout';
