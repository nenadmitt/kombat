import type { ChromaCard, ChromaSuit } from '@gaming-platform/core';
import type { CSSProperties } from 'react';

import { CHROMA_SUIT_VAR, glyphFor, isActionValue } from './chroma-theme';

type Props = {
  card: ChromaCard;
  /** Card width; height follows the design's 2:3 ratio. */
  width: number;
  /** Outlined as currently legal to play. */
  playable?: boolean;
  /** Picked in the hand: lime ring, glow and a lift. */
  selected?: boolean;
  dimmed?: boolean;
};

/** Geometry that keeps a card recognisable at any width, from the design. */
function frame(width: number): CSSProperties {
  return {
    '--card-w': `${width}px`,
    '--card-h': `${Math.round(width * 1.5)}px`,
    '--card-r': `${Math.round(width * 0.14)}px`,
  } as CSSProperties;
}

/**
 * One Chroma card: suit-coloured face (wilds get the four-quadrant back), the
 * white oval rotated across the middle, the face glyph in the suit colour and
 * small white corner glyphs, the lower one upside down.
 */
export function ChromaCardView({
  card,
  width,
  playable = false,
  selected = false,
  dimmed = false,
}: Props) {
  const isWild = card.suit === 'wild';
  const glyph = glyphFor(card.value);
  const style: CSSProperties = {
    ...frame(width),
    '--suit': isWild
      ? 'var(--chroma-wild)'
      : CHROMA_SUIT_VAR[card.suit as ChromaSuit],
    '--glyph-size': `${Math.round(width * (isActionValue(card.value) ? 0.4 : 0.56))}px`,
    '--corner-size': `${Math.max(9, Math.round(width * 0.2))}px`,
  } as CSSProperties;

  const classes = ['chroma-card'];
  if (playable || selected) classes.push('is-playable');
  if (selected) classes.push('is-selected');
  if (dimmed) classes.push('is-dimmed');

  return (
    <span className={classes.join(' ')} style={style}>
      {isWild && <span className="chroma-card-quads" />}
      <span className="chroma-card-oval" />
      <span className="chroma-card-glyph">{glyph}</span>
      <span className="chroma-card-corner">{glyph}</span>
      <span className="chroma-card-corner is-br">{glyph}</span>
    </span>
  );
}

/** The face-down back used for the draw pile and opponents' mini cards. */
export function ChromaCardBack({ width }: { width: number }) {
  return (
    <span className="chroma-card chroma-card-back" style={frame(width)}>
      <span
        className="chroma-card-back-oval"
        style={
          {
            '--back-star': `${Math.round(width * 0.25)}px`,
          } as CSSProperties
        }
      >
        <span className="chroma-card-back-star">✦</span>
      </span>
    </span>
  );
}
