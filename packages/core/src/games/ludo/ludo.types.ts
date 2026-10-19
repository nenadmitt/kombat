export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export const LUDO_COLORS: readonly LudoColor[] = [
  'red',
  'green',
  'yellow',
  'blue',
];

export type LudoCell = { row: number; col: number };

/** -1 base; 0..50 shared track; 51..55 own home column; 56 home. */
export type LudoProgress = number;

export type LudoTokens = Partial<Record<LudoColor, LudoProgress[]>>;

export type LudoPlayer = {
  userId: string;
  color: LudoColor;
};

export type LudoStage = 'roll' | 'move';

export type LudoCapture = {
  color: LudoColor;
  tokenIndex: number;
};

export type LudoEndReason = 'complete' | 'forfeit' | 'timeout';
