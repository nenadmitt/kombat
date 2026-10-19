import type { ChromaCard, ChromaSuit } from '@gaming-platform/core';
import type { CSSProperties } from 'react';

import { CHROMA_SUIT_VAR, glyphFor, isActionValue } from './chroma-theme';

type Props = {
  card: ChromaCard;
  /** Any CSS length; every other card measurement derives from it. */
  width: string;
  playable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
};

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
