import type {
  ChromaCard,
  ChromaDirection,
  ChromaSuit,
  ChromaValue,
} from './chroma.types';
import { CHROMA_SUITS } from './chroma.types';

export const CHROMA_MIN_PLAYERS = 2;
export const CHROMA_MAX_PLAYERS = 4;

export const CHROMA_HAND_SIZE = 7;

export const SOLO_PENALTY_DRAWS = 2;

const NUMBER_VALUES: ChromaValue[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

export function isNumberValue(value: ChromaValue): boolean {
  return NUMBER_VALUES.includes(value);
}

export function buildDeck(): ChromaCard[] {
  const deck: ChromaCard[] = [];
  for (const suit of CHROMA_SUITS) {
    deck.push({ suit, value: '0' });
    for (const value of NUMBER_VALUES.slice(1)) {
      deck.push({ suit, value }, { suit, value });
    }
    for (const value of ['freeze', 'flip', 'draw2'] as ChromaValue[]) {
      deck.push({ suit, value }, { suit, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ suit: 'wild', value: 'prism' });
    deck.push({ suit: 'wild', value: 'draw4' });
  }
  return deck;
}

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function takeStarter(deck: ChromaCard[]): {
  starter: ChromaCard;
  deck: ChromaCard[];
} {
  const idx = deck.findIndex(c => isNumberValue(c.value));
  const starter = deck[idx]!;
  return { starter, deck: [...deck.slice(0, idx), ...deck.slice(idx + 1)] };
}

/** After a wild the top face matches no coloured card, so only the chosen colour does. */
export function isPlayable(
  card: ChromaCard,
  activeSuit: ChromaSuit,
  topValue: ChromaValue,
): boolean {
  return (
    card.suit === 'wild' || card.suit === activeSuit || card.value === topValue
  );
}

export function playableIndexes(
  hand: ChromaCard[],
  activeSuit: ChromaSuit,
  topValue: ChromaValue,
): number[] {
  return hand
    .map((card, i) => (isPlayable(card, activeSuit, topValue) ? i : -1))
    .filter(i => i !== -1);
}

export type ChromaPlayEffect = {
  needsColorPick: boolean;
  victimDraws: number;
  skipsNext: boolean;
  flipsDirection: boolean;
};

export function playEffect(
  card: ChromaCard,
  playerCount: number,
): ChromaPlayEffect {
  const twoPlayer = playerCount === 2;
  switch (card.value) {
    case 'freeze':
      return { needsColorPick: false, victimDraws: 0, skipsNext: true, flipsDirection: false };
    case 'flip':
      // Official 2-player rule: reverse acts as a skip.
      return twoPlayer
        ? { needsColorPick: false, victimDraws: 0, skipsNext: true, flipsDirection: false }
        : { needsColorPick: false, victimDraws: 0, skipsNext: false, flipsDirection: true };
    case 'draw2':
      return { needsColorPick: false, victimDraws: 2, skipsNext: true, flipsDirection: false };
    case 'prism':
      return { needsColorPick: true, victimDraws: 0, skipsNext: false, flipsDirection: false };
    case 'draw4':
      return { needsColorPick: true, victimDraws: 4, skipsNext: true, flipsDirection: false };
    default:
      return { needsColorPick: false, victimDraws: 0, skipsNext: false, flipsDirection: false };
  }
}

export function nextSeatIndex(
  seatCount: number,
  from: number,
  direction: ChromaDirection,
  eliminated: ReadonlySet<number>,
  steps = 1,
): number {
  let idx = from;
  for (let s = 0; s < steps; s++) {
    for (let hop = 0; hop < seatCount; hop++) {
      idx = (idx + direction + seatCount) % seatCount;
      if (!eliminated.has(idx)) {
        break;
      }
    }
  }
  return idx;
}

export function chooseBotPlay(
  hand: ChromaCard[],
  activeSuit: ChromaSuit,
  topValue: ChromaValue,
): number | null {
  const playable = playableIndexes(hand, activeSuit, topValue);
  if (playable.length === 0) {
    return null;
  }
  const rank = (card: ChromaCard): number => {
    if (card.value === 'draw2') return 5;
    if (card.value === 'freeze' || card.value === 'flip') return 4;
    if (isNumberValue(card.value)) return 3 + Number(card.value) / 100;
    if (card.value === 'draw4') return 2;
    return 1; // prism last - pure colour changes are most valuable held
  };
  return playable.reduce((best, i) =>
    rank(hand[i]!) > rank(hand[best]!) ? i : best,
  );
}

export function chooseBotColor(hand: ChromaCard[]): ChromaSuit {
  const counts = new Map<ChromaSuit, number>();
  for (const suit of CHROMA_SUITS) {
    counts.set(suit, 0);
  }
  for (const card of hand) {
    if (card.suit !== 'wild') {
      counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
    }
  }
  const max = Math.max(...counts.values());
  const top = CHROMA_SUITS.filter(s => counts.get(s) === max);
  return top[Math.floor(Math.random() * top.length)]!;
}
