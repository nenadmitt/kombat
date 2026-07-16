import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { MINES_PER_PLAYER } from '@gaming-platform/core';

import Icon from '../../../components/Icon';
import { colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import { MineMarker } from '../battleship-markers';
import { MINE_COLOR } from './ship-placement.constants';

const ICON_SIZE = 26;

type Props = {
  /** Mines armed so far (0..MINES_PER_PLAYER). */
  placedCount: number;
  selected: boolean;
  onSelect: () => void;
};

/** The single "Mines ×2" card in the "YOUR SHIPS" tray. Tap it to arm mine
 *  placement; tap an armed mine on the grid to remove it. */
export default function MineCard({ placedCount, selected, onSelect }: Props) {
  const allPlaced = placedCount >= MINES_PER_PLAYER;
  return (
    <Pressable
      disabled={allPlaced}
      onPress={onSelect}
      style={[styles.card, selected && !allPlaced && styles.cardSelected]}
    >
      {allPlaced ? (
        <View style={styles.badgeDone}>
          <Icon type="check" color={colors.success} size={11} />
        </View>
      ) : selected ? (
        <View style={styles.badgeNext}>
          <Text style={styles.badgeNextText}>PLACE</Text>
        </View>
      ) : null}

      <View style={[styles.iconWrapper, allPlaced && styles.placedDim]}>
        <Canvas style={styles.iconCanvas}>
          <MineMarker
            cx={ICON_SIZE / 2}
            cy={ICON_SIZE / 2}
            cellSize={ICON_SIZE * 0.8}
          />
        </Canvas>
      </View>
      <Text style={styles.label}>Mines {MINES_PER_PLAYER}×</Text>
      <View style={styles.dotsRow}>
        {Array.from({ length: MINES_PER_PLAYER }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i < placedCount ? MINE_COLOR : colors.textFaint,
              },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingTop: 22,
    paddingBottom: 12,
    paddingHorizontal: spacing.xs,
  },
  cardSelected: {
    borderColor: MINE_COLOR,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  badgeDone: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  badgeNext: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderWidth: 1,
    borderColor: MINE_COLOR,
    borderRadius: radius.chip,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeNextText: {
    fontSize: 8,
    fontFamily: fonts.extraBold,
    color: MINE_COLOR,
  },
  iconWrapper: {
    height: 20,
    justifyContent: 'center',
  },
  iconCanvas: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  placedDim: {
    opacity: 0.35,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
