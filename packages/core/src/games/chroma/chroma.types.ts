export type ChromaSuit = 'crimson' | 'amber' | 'jade' | 'azure';

export const CHROMA_SUITS: readonly ChromaSuit[] = [
  'crimson',
  'amber',
  'jade',
  'azure',
];

/** freeze = skip, flip = reverse, prism = colour change, draw4 = colour change + draw four. */
export type ChromaValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'freeze'
  | 'flip'
  | 'draw2'
  | 'prism'
  | 'draw4';

export type ChromaCard = {
  suit: ChromaSuit | 'wild';
  value: ChromaValue;
};

export type ChromaStage = 'play' | 'pick-color';

export type ChromaDirection = 1 | -1;

export type ChromaEndReason = 'complete' | 'forfeit' | 'timeout';

export type ChromaSeat = {
  userId: string;
};
