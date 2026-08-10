import type { ChromaCard, ChromaSuit } from '@gaming-platform/core';
import type { CSSProperties } from 'react';

import { CHROMA_SUIT_VAR, glyphFor, isActionValue } from './chroma-theme';

type Props = {
  card: ChromaCard;
  /** Any CSS length. Every other measurement on the card derives from it in
   *  the stylesheet, so a fluid width scales the whole face. */
  width: string;
  /** Outlined as currently legal to play. */
  playable?: boolean;
  /** Picked in the hand: lime ring, glow and a lift. */
  selected?: boolean;
  dimmed?: boolean;
};

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
    '--card-w': width,
    '--suit': isWild
      ? 'var(--chroma-wild)'
      : CHROMA_SUIT_VAR[card.suit as ChromaSuit],
    '--glyph-scale': isActionValue(card.value) ? '0.4' : '0.56',
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
export function ChromaCardBack({ width }: { width: string }) {
  return (
    <span
      className="chroma-card chroma-card-back"
      style={{ '--card-w': width } as CSSProperties}
    >
      <span className="chroma-card-back-oval">
        <span className="chroma-card-back-star">✦</span>
      </span>
    </span>
  );
}
