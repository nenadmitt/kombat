/** The four card colours (the design's names). */
export type ChromaSuit = 'crimson' | 'amber' | 'jade' | 'azure';

export const CHROMA_SUITS: readonly ChromaSuit[] = [
  'crimson',
  'amber',
  'jade',
  'azure',
];

/**
 * Card faces: numbers plus the action cards - freeze (skip), flip (reverse),
 * draw2, and the two wilds: prism (colour change) and draw4 (colour change
 * + victim draws four).
 */
export type ChromaValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'freeze'
  | 'flip'
  | 'draw2'
  | 'prism'
  | 'draw4';

/** A card: wild cards have suit 'wild' (their colour is chosen when played). */
export type ChromaCard = {
  suit: ChromaSuit | 'wild';
  value: ChromaValue;
};

/** Within a turn: playing/drawing, or picking the colour for a played wild. */
export type ChromaStage = 'play' | 'pick-color';

/** Turn direction around the table (flip toggles it). */
export type ChromaDirection = 1 | -1;

/** Why a Chroma match ended (relative to the winner). */
export type ChromaEndReason = 'complete' | 'forfeit' | 'timeout';

/** A seat in the match, in join order (= base turn order). */
export type ChromaSeat = {
  userId: string;
};
