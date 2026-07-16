import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { MINES_PER_PLAYER, type MinePlacement } from '@gaming-platform/core';

import Icon from '../../../components/Icon';
import { colors, radius, spacing } from '../../../theme/colors';
import { display, fonts } from '../../../theme/typography';
import { MineMarker } from '../battleship-markers';
import { COLUMN_LABELS, MINE_COLOR } from './ship-placement.constants';

const ICON_BOX = 40;

type Props = {
  /** Mines armed so far. */
  mines: MinePlacement[];
  selected: boolean;
  onSelect: () => void;
};

const cellLabel = (m: MinePlacement) => `${COLUMN_LABELS[m.col]}${m.row + 1}`;

/** The wide "Mines 2×" card in the DEFENSES section below the ship tray.
 *  Tap it to arm mine placement; tap an armed mine on the grid to remove it. */
export default function MineCard({ mines, selected, onSelect }: Props) {
  const left = MINES_PER_PLAYER - mines.length;
  const allPlaced = left <= 0;
  const active = selected && !allPlaced;
  const status = allPlaced
    ? `Armed at ${mines.map(cellLabel).join(' · ')}`
    : active
      ? `Tap a cell · ${left} left`
      : `${left} left to arm`;

  return (
    <Pressable
      disabled={allPlaced}
      onPress={onSelect}
      style={[styles.card, active && styles.cardSelected]}
    >
      <View style={styles.iconWrap}>
        <Canvas style={styles.iconCanvas}>
          <MineMarker
            cx={ICON_BOX / 2}
            cy={ICON_BOX / 2}
            cellSize={ICON_BOX * 0.62}
          />
        </Canvas>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.title}>Mines {MINES_PER_PLAYER}×</Text>
        <Text style={[styles.status, allPlaced && styles.statusArmed]}>
          {status}
        </Text>
      </View>
      {allPlaced ? (
        <View style={styles.checkBadge}>
          <Icon type="check" color={colors.background} size={12} />
        </View>
      ) : active ? (
        <Text style={styles.placeBadge}>PLACE</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  cardSelected: {
    borderColor: MINE_COLOR,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  iconWrap: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCanvas: {
    width: ICON_BOX,
    height: ICON_BOX,
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: display.semiBold,
    color: colors.textPrimary,
  },
  status: {
    fontSize: 12,
    color: colors.textMuted,
  },
  statusArmed: {
    color: colors.success,
  },
  placeBadge: {
    fontSize: 10,
    fontFamily: fonts.extraBold,
    color: MINE_COLOR,
    letterSpacing: 1,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
