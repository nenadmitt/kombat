import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../../../components/Icon';
import { colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import ShipGraphic from '../ShipGraphic';
import type { ShipDef } from './ship-placement.types';

type Props = {
  ship: ShipDef;
  placed: boolean;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
};

export default function ShipCard({
  ship,
  placed,
  selected,
  onSelect,
  onRemove,
}: Props) {
  return (
    <Pressable
      disabled={placed}
      onPress={onSelect}
      style={[styles.card, selected && !placed && styles.cardSelected]}
    >
      {placed ? (
        <Pressable style={styles.removeButton} onPress={onRemove} hitSlop={8}>
          <Icon type="trash" color={colors.textPrimary} size={11} />
        </Pressable>
      ) : selected ? (
        <View style={styles.badgeNext}>
          <Text style={styles.badgeNextText}>PLACE</Text>
        </View>
      ) : null}

      <View style={[styles.shipWrapper, placed && styles.placedDim]}>
        <ShipGraphic cells={ship.size} color={ship.color} />
      </View>
      <Text style={styles.label}>{ship.label}</Text>
      <View style={styles.dotsRow}>
        {Array.from({ length: ship.size }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: ship.color },
              placed && styles.placedDim,
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexBasis: '30%',
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
    borderColor: colors.accent,
    backgroundColor: 'rgba(142, 224, 90, 0.1)',
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
    height: 20,
    justifyContent: 'center',
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
