import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../../../components/Icon';
import { colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import type { Orientation, ShipDef } from './ship-placement.types';

const SHIP_GRAPHIC_SPAN = 44;

type Props = {
  ship: ShipDef;
  placed: boolean;
  selected: boolean;
  orientation: Orientation;
  onSelect: () => void;
  onRotate: () => void;
  onRemove: () => void;
};

/** One ship in the "YOUR SHIPS" tray. Tap to select it for placement, tap the
 *  bottom button to rotate it, or (once placed) tap the top button to remove it. */
export default function ShipCard({
  ship,
  placed,
  selected,
  orientation,
  onSelect,
  onRotate,
  onRemove,
}: Props) {
  const graphicSize =
    orientation === 'h'
      ? { width: SHIP_GRAPHIC_SPAN, height: SHIP_GRAPHIC_SPAN / ship.size }
      : { width: SHIP_GRAPHIC_SPAN / ship.size, height: SHIP_GRAPHIC_SPAN };

  return (
    <View style={[styles.card, selected && !placed && styles.cardSelected]}>
      {placed ? (
        <Pressable style={styles.removeButton} onPress={onRemove} hitSlop={8}>
          <Icon type="trash" color={colors.textPrimary} size={12} />
        </Pressable>
      ) : selected ? (
        <View style={styles.badgeNext}>
          <Text style={styles.badgeNextText}>PLACE</Text>
        </View>
      ) : null}

      <Pressable
        disabled={placed}
        onPress={onSelect}
        style={styles.shipWrapper}
        hitSlop={4}
      >
        <View
          style={[
            styles.ship,
            graphicSize,
            { backgroundColor: ship.color },
            placed && styles.shipPlaced,
          ]}
        />
      </Pressable>

      <Text style={styles.label}>{ship.label}</Text>
      <Text style={styles.cells}>{ship.size} cells</Text>

      {!placed && (
        <Pressable style={styles.rotateButton} onPress={onRotate} hitSlop={8}>
          <Icon type="rotate-cw" color={colors.textMuted} size={12} />
        </Pressable>
      )}
    </View>
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  cardSelected: {
    borderColor: colors.brandStart,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNext: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderWidth: 1,
    borderColor: colors.brandStart,
    borderRadius: radius.chip,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeNextText: {
    fontSize: 8,
    fontFamily: fonts.extraBold,
    color: colors.brandStart,
  },
  shipWrapper: {
    height: SHIP_GRAPHIC_SPAN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ship: {
    borderRadius: 6,
  },
  shipPlaced: {
    opacity: 0.4,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  cells: {
    fontSize: 10,
    color: colors.textMuted,
  },
  rotateButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
