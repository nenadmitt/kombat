import type {
  ChromaCard,
  ChromaDirection,
  ChromaSuit,
  ChromaValue,
} from './chroma.types';
import { CHROMA_SUITS } from './chroma.types';

/** Room sizing: like Ludo - up to four seats, creator may start with 2+. */
export const CHROMA_MIN_PLAYERS = 2;
export const CHROMA_MAX_PLAYERS = 4;

/** Cards dealt to each player at the start. */
export const CHROMA_HAND_SIZE = 7;

/** Cards drawn as the SOLO penalty (reached one card without arming SOLO). */
export const SOLO_PENALTY_DRAWS = 2;

const NUMBER_VALUES: ChromaValue[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];

/** Whether a value is one of the number faces. */
export function isNumberValue(value: ChromaValue): boolean {
  return NUMBER_VALUES.includes(value);
}

/**
 * The canonical 108-card deck (UNO's structure, reskinned): per suit one 0,
 * two of each 1-9, two freeze, two flip, two draw2; plus four prism and four
 * draw4 wilds.
 */
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

/** Fisher-Yates with an injectable RNG (server passes crypto randomness). */
export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Pull the starter card for the discard pile: the first NUMBER card in the
 * shuffled deck (actions never start a match), removed in place.
 */
export function takeStarter(deck: ChromaCard[]): {
  starter: ChromaCard;
  deck: ChromaCard[];
} {
  const idx = deck.findIndex(c => isNumberValue(c.value));
  const starter = deck[idx]!;
  return { starter, deck: [...deck.slice(0, idx), ...deck.slice(idx + 1)] };
}

/**
 * Whether a card may be played on the current pile state: wilds always;
 * otherwise match the active colour or the top card's face. (After a wild,
 * the top face is 'prism'/'draw4', which no coloured card carries - so only
 * the chosen colour matches, as intended.)
 */
export function isPlayable(
  card: ChromaCard,
  activeSuit: ChromaSuit,
  topValue: ChromaValue,
): boolean {
  return (
    card.suit === 'wild' || card.suit === activeSuit || card.value === topValue
  );
}

/** Hand indexes playable right now. */
export function playableIndexes(
  hand: ChromaCard[],
  activeSuit: ChromaSuit,
  topValue: ChromaValue,
): number[] {
  return hand
    .map((card, i) => (isPlayable(card, activeSuit, topValue) ? i : -1))
    .filter(i => i !== -1);
}

/** What playing a card does, for the state machine to apply. */
export type ChromaPlayEffect = {
  /** The player must pick a colour before the play resolves. */
  needsColorPick: boolean;
  /** Cards the next player is forced to draw (0, 2 or 4). */
  victimDraws: number;
  /** The next player loses their turn (freeze, or forced draws). */
  skipsNext: boolean;
  /** Direction toggles (flip). In a 2-player match flip skips instead. */
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

/**
 * The seat index `steps` seats along from `from` in `direction`, skipping
 * eliminated seats. Returns `from` itself if nobody else remains.
 */
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

// --- demo bot policy ---------------------------------------------------------

/**
 * Pick the bot's play, or null to draw. Prefers unloading forced-draw and
 * skip cards, then numbers of its strongest colour, and keeps wilds for when
 * nothing else fits - a serviceable casual opponent, not a shark.
 */
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

/** The bot's wild colour: its most-held suit (random tie-break). */
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
