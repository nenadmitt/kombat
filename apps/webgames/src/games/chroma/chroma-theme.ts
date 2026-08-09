import type { ChromaSuit, ChromaValue } from '@gaming-platform/core';

/** Suit colour as a CSS token reference, for anything the browser paints. */
export const CHROMA_SUIT_VAR: Record<ChromaSuit, string> = {
  crimson: 'var(--chroma-crimson)',
  amber: 'var(--chroma-amber)',
  jade: 'var(--chroma-jade)',
  azure: 'var(--chroma-azure)',
};

/** Gradients and glows need a concrete colour, so the hexes live here once. */
export const CHROMA_SUIT_HEX: Record<ChromaSuit, string> = {
  crimson: '#E5484D',
  amber: '#F5A524',
  jade: '#30A46C',
  azure: '#3B82F6',
};

export const SUIT_LABELS: Record<ChromaSuit, string> = {
  crimson: 'Crimson',
  amber: 'Amber',
  jade: 'Jade',
  azure: 'Azure',
};

/** Action faces render as the design's glyphs; numbers render as themselves. */
const VALUE_GLYPHS: Partial<Record<ChromaValue, string>> = {
  freeze: '⊘',
  flip: '⇄',
  draw2: '+2',
  prism: '✦',
  draw4: '+4',
};

export function glyphFor(value: ChromaValue): string {
  return VALUE_GLYPHS[value] ?? value;
}

export function isActionValue(value: ChromaValue): boolean {
  return VALUE_GLYPHS[value] !== undefined;
}

/** Spoken names for notices ("Kraken played Jade +2"). */
export function describeCard(card: {
  suit: ChromaSuit | 'wild';
  value: ChromaValue;
}): string {
  const face =
    card.value === 'freeze'
      ? 'Freeze'
      : card.value === 'flip'
        ? 'Flip'
        : card.value === 'draw2'
          ? '+2'
          : card.value === 'prism'
            ? 'Prism'
            : card.value === 'draw4'
              ? 'Prism +4'
              : card.value;
  return card.suit === 'wild' ? face : `${SUIT_LABELS[card.suit]} ${face}`;
}
