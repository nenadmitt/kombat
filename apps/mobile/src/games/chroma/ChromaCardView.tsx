import { StyleSheet, Text, View } from 'react-native';
import type { ChromaSuit } from '@gaming-platform/core';
import type { ChromaCard } from '@gaming-platform/core';

import { colors } from '../../theme/colors';
import { display } from '../../theme/typography';
import { SUIT_COLORS, glyphFor, isActionValue } from './chroma-theme';

const WILD_BG = '#1B1D2B';

type Props = {
  card: ChromaCard;
  width: number;
  playable?: boolean;
  selected?: boolean;
  dimmed?: boolean;
};

export default function ChromaCardView({
  card,
  width,
  playable = false,
  selected = false,
  dimmed = false,
}: Props) {
  const height = Math.round(width * 1.5);
  const radius = Math.round(width * 0.14);
  const isWild = card.suit === 'wild';
  const faceColor = isWild ? WILD_BG : SUIT_COLORS[card.suit as ChromaSuit];
  const glyph = glyphFor(card.value);
  const glyphSize = Math.round(width * (isActionValue(card.value) ? 0.4 : 0.56));
  const cornerSize = Math.max(9, Math.round(width * 0.2));

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: faceColor,
          borderColor: selected
            ? colors.accent
            : playable
              ? colors.accent
              : 'rgba(0, 0, 0, 0.2)',
          borderWidth: selected || playable ? 2 : 1.5,
        },
        selected && styles.selectedGlow,
        dimmed && styles.dimmed,
      ]}
    >
      {isWild && (
        <View style={[styles.fill, { borderRadius: radius - 2, overflow: 'hidden' }]}>
          <View style={styles.quadRow}>
            <View style={[styles.quad, { backgroundColor: SUIT_COLORS.crimson }]} />
            <View style={[styles.quad, { backgroundColor: SUIT_COLORS.amber }]} />
          </View>
          <View style={styles.quadRow}>
            <View style={[styles.quad, { backgroundColor: SUIT_COLORS.jade }]} />
            <View style={[styles.quad, { backgroundColor: SUIT_COLORS.azure }]} />
          </View>
        </View>
      )}

      <View
        style={[
          styles.oval,
          {
            width: Math.round(width * 0.92),
            height: Math.round(width * 0.62),
            borderRadius: width,
            marginLeft: -Math.round(width * 0.46),
            marginTop: -Math.round(width * 0.31),
          },
        ]}
      />
      <Text
        style={[
          styles.glyph,
          { fontSize: glyphSize, color: isWild ? WILD_BG : faceColor },
        ]}
      >
        {glyph}
      </Text>
      <Text style={[styles.corner, styles.cornerTL, { fontSize: cornerSize }]}>
        {glyph}
      </Text>
      <Text style={[styles.corner, styles.cornerBR, { fontSize: cornerSize }]}>
        {glyph}
      </Text>
    </View>
  );
}

export function ChromaCardBack({ width }: { width: number }) {
  const height = Math.round(width * 1.5);
  return (
    <View
      style={[
        styles.card,
        styles.back,
        { width, height, borderRadius: Math.round(width * 0.14) },
      ]}
    >
      <View
        style={[
          styles.backOval,
          {
            width: Math.round(width * 0.56),
            height: Math.round(width * 0.82),
            borderRadius: width,
          },
        ]}
      >
        <Text style={[styles.backStar, { fontSize: Math.round(width * 0.25) }]}>✦</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  selectedGlow: {
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  dimmed: { opacity: 0.45 },
  quadRow: { flex: 1, flexDirection: 'row' },
  quad: { flex: 1 },
  oval: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-32deg' }],
  },
  glyph: {
    fontFamily: display.bold,
    zIndex: 2,
  },
  corner: {
    position: 'absolute',
    fontFamily: display.bold,
    color: '#FFFFFF',
    zIndex: 2,
  },
  cornerTL: { top: 4, left: 6 },
  cornerBR: { bottom: 4, right: 6, transform: [{ rotate: '180deg' }] },
  back: {
    backgroundColor: '#232532',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  backOval: {
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-32deg' }],
  },
  backStar: {
    color: colors.accent,
    transform: [{ rotate: '32deg' }],
  },
});
