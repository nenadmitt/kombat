import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import Icon from '../../../components/Icon';
import { colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import { DOUBLE_TAP_MS, DRAG_THRESHOLD } from './ship-placement.constants';
import type { Orientation, ShipDef } from './ship-placement.types';

const CARD_SHIP_WIDTH = 44;

type Props = {
  ship: ShipDef;
  placed: boolean;
  isNext: boolean;
  orientation: Orientation;
  onDragStart: () => void;
  onDragMove: (ship: ShipDef, pageX: number, pageY: number) => void;
  onDrop: (
    ship: ShipDef,
    pageX: number,
    pageY: number,
    snapBack: () => void,
  ) => void;
  onRotate: () => void;
  onCancel: () => void;
};

/** One draggable ship in the "YOUR SHIPS" tray — drag onto the grid to place,
 *  double-tap to rotate before dragging. */
export default function ShipCard({
  ship,
  placed,
  isNext,
  orientation,
  onDragStart,
  onDragMove,
  onDrop,
  onRotate,
  onCancel,
}: Props) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const lastReleaseAt = useRef<number | null>(null);

  const snapBack = () =>
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !placed,
      onPanResponderGrant: () => {
        moved.current = false;
        setDragging(true);
        pan.setValue({ x: 0, y: 0 });
        onDragStart();
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > DRAG_THRESHOLD) {
          moved.current = true;
        }
        pan.setValue({ x: g.dx, y: g.dy });
        onDragMove(ship, g.moveX, g.moveY);
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        if (!moved.current) {
          snapBack();
          const now = Date.now();
          if (lastReleaseAt.current && now - lastReleaseAt.current < DOUBLE_TAP_MS) {
            lastReleaseAt.current = null;
            onRotate();
          } else {
            lastReleaseAt.current = now;
          }
          return;
        }
        lastReleaseAt.current = null;
        onDrop(ship, g.moveX, g.moveY, snapBack);
      },
      onPanResponderTerminate: () => {
        snapBack();
        onCancel();
        setDragging(false);
      },
    }),
  ).current;

  const graphicSize =
    orientation === 'h'
      ? { width: CARD_SHIP_WIDTH, height: CARD_SHIP_WIDTH / ship.size }
      : { width: CARD_SHIP_WIDTH / ship.size, height: CARD_SHIP_WIDTH };

  return (
    <View style={styles.card}>
      {placed ? (
        <View style={styles.badgePlaced}>
          <Icon type="check" color={colors.textPrimary} size={12} />
        </View>
      ) : isNext ? (
        <View style={styles.badgeNext}>
          <Text style={styles.badgeNextText}>PLACE</Text>
        </View>
      ) : null}

      <Animated.View
        {...(placed ? {} : responder.panHandlers)}
        style={[
          styles.shipWrapper,
          dragging && styles.dragging,
          { transform: pan.getTranslateTransform() },
        ]}
      >
        <View
          style={[
            styles.ship,
            graphicSize,
            { backgroundColor: ship.color },
            placed && styles.shipPlaced,
          ]}
        />
      </Animated.View>
      <Text style={styles.label}>{ship.label}</Text>
      <Text style={styles.cells}>{ship.size} cells</Text>
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
  badgePlaced: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
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
    height: CARD_SHIP_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragging: {
    zIndex: 10,
    opacity: 0.9,
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
});
