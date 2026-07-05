import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Canvas,
  Group,
  Line,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';

import Icon from '../../../components/Icon';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import ShipCard from './ShipCard';
import {
  COLUMN_LABELS,
  GRID,
  LABEL_GUTTER,
  ROW_LABELS,
  SETUP_DURATION_SECONDS,
  SHIPS,
  SHIP_BY_ID,
} from './ship-placement.constants';
import type { Orientation, Placement, Preview, ShipDef } from './ship-placement.types';
import {
  buildOccupied,
  canPlace,
  cellsFor,
  formatCountdown,
  randomPlacement,
} from './ship-placement.utils';

type Props = {
  onReady: (placements: Record<string, Placement>) => void;
  onExit: () => void;
};

/** "Deploy Your Fleet" — drag each ship onto the grid before the countdown runs out. */
export default function BattleshipSetupScreen({ onReady, onExit }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [pendingOrientation, setPendingOrientation] = useState<
    Record<string, Orientation>
  >(Object.fromEntries(SHIPS.map(s => [s.id, 'h' as Orientation])));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SETUP_DURATION_SECONDS);

  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const pendingOrientationRef = useRef(pendingOrientation);
  pendingOrientationRef.current = pendingOrientation;

  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0 });
  const measureBoard = () =>
    boardRef.current?.measureInWindow((x, y) => {
      boardOrigin.current = { x, y };
    });

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const candidateAt = (ship: ShipDef, pageX: number, pageY: number) => {
    const { x, y } = boardOrigin.current;
    const col = Math.floor((pageX - x) / cell);
    const row = Math.floor((pageY - y) / cell);
    const orientation = pendingOrientationRef.current[ship.id]!;
    const cells = cellsFor({ row, col, orientation }, ship.size);
    const occupied = buildOccupied(placementsRef.current);
    const inside =
      pageX >= x && pageX <= x + boardSize && pageY >= y && pageY <= y + boardSize;
    return { row, col, orientation, cells, valid: canPlace(cells, occupied), inside };
  };

  const handleDragMove = (ship: ShipDef, pageX: number, pageY: number) => {
    const { cells, valid, inside } = candidateAt(ship, pageX, pageY);
    setPreview(inside ? { cells, valid } : null);
  };

  const handleDrop = (
    ship: ShipDef,
    pageX: number,
    pageY: number,
    snapBack: () => void,
  ) => {
    const { row, col, orientation, valid, inside } = candidateAt(ship, pageX, pageY);
    if (inside && valid) {
      setPlacements(prev => ({ ...prev, [ship.id]: { row, col, orientation } }));
    } else {
      snapBack();
    }
    setPreview(null);
  };

  const handleRotate = (shipId: string) => {
    setPendingOrientation(prev => ({
      ...prev,
      [shipId]: prev[shipId] === 'h' ? 'v' : 'h',
    }));
  };

  const handleRemoveAt = (row: number, col: number) => {
    setPlacements(prev => {
      const hitId = Object.keys(prev).find(id =>
        cellsFor(prev[id]!, SHIP_BY_ID[id]!.size).some(
          c => c.r === row && c.c === col,
        ),
      );
      if (!hitId) {
        return prev;
      }
      const { [hitId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handleAutoPlace = () => {
    let next = { ...placementsRef.current };
    for (const ship of SHIPS) {
      if (next[ship.id]) {
        continue;
      }
      for (let attempt = 0; attempt < 200; attempt++) {
        const candidate = randomPlacement(ship.size);
        const cells = cellsFor(candidate, ship.size);
        if (canPlace(cells, buildOccupied(next))) {
          next = { ...next, [ship.id]: candidate };
          break;
        }
      }
    }
    setPlacements(next);
  };

  const handleGridTap = (locationX: number, locationY: number) => {
    handleRemoveAt(Math.floor(locationY / cell), Math.floor(locationX / cell));
  };

  const placedCount = Object.keys(placements).length;
  const allPlaced = placedCount === SHIPS.length;
  const nextShipId = SHIPS.find(s => !placements[s.id])?.id;
  const gridLines = Array.from({ length: GRID + 1 }, (_, i) => i * cell);
  const previewColor = preview?.valid
    ? 'rgba(34,197,94,0.55)'
    : 'rgba(239,68,68,0.55)';

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onExit}>
          <Icon type="chevron-left" color={colors.textPrimary} size={20} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>BATTLE STARTS IN</Text>
          <Text style={styles.headerTimer}>{formatCountdown(secondsLeft)}</Text>
        </View>
        <Pressable style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Deploy Your Fleet</Text>
        <Text style={styles.subtitle}>
          Drag ships onto the grid. Double-tap a ship to rotate it.
        </Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={[
                styles.progressFill,
                { width: `${(placedCount / SHIPS.length) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {placedCount} / {SHIPS.length} placed
          </Text>
        </View>

        <View style={styles.gridRow}>
          <View style={{ width: LABEL_GUTTER }} />
          {COLUMN_LABELS.map(label => (
            <Text key={label} style={[styles.axisLabel, { width: cell }]}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.gridRow}>
          <View style={{ width: LABEL_GUTTER }}>
            {ROW_LABELS.map(n => (
              <Text
                key={n}
                style={[styles.axisLabel, { height: cell, lineHeight: cell }]}
              >
                {n}
              </Text>
            ))}
          </View>

          <View
            ref={boardRef}
            onLayout={measureBoard}
            style={{ width: boardSize, height: boardSize }}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect
                x={0}
                y={0}
                width={boardSize}
                height={boardSize}
                color={colors.surfaceMuted}
              />
              <Group>
                {gridLines.map(pos => (
                  <Line
                    key={`v${pos}`}
                    p1={vec(pos, 0)}
                    p2={vec(pos, boardSize)}
                    color={colors.cardBorder}
                    strokeWidth={1}
                  />
                ))}
                {gridLines.map(pos => (
                  <Line
                    key={`h${pos}`}
                    p1={vec(0, pos)}
                    p2={vec(boardSize, pos)}
                    color={colors.cardBorder}
                    strokeWidth={1}
                  />
                ))}
              </Group>

              {Object.entries(placements).map(([id, p]) => {
                const size = SHIP_BY_ID[id]!.size;
                const w = (p.orientation === 'h' ? size : 1) * cell;
                const h = (p.orientation === 'v' ? size : 1) * cell;
                return (
                  <RoundedRect
                    key={id}
                    x={p.col * cell + 2}
                    y={p.row * cell + 2}
                    width={w - 4}
                    height={h - 4}
                    r={6}
                    color={colors.brandStart}
                  />
                );
              })}

              {preview?.cells
                .filter(({ r, c }) => r >= 0 && r < GRID && c >= 0 && c < GRID)
                .map(({ r, c }) => (
                  <Rect
                    key={`p${r}-${c}`}
                    x={c * cell + 1}
                    y={r * cell + 1}
                    width={cell - 2}
                    height={cell - 2}
                    color={previewColor}
                  />
                ))}
            </Canvas>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={e =>
                handleGridTap(e.nativeEvent.locationX, e.nativeEvent.locationY)
              }
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>YOUR SHIPS</Text>
        <View style={styles.tray}>
          {SHIPS.map(ship => (
            <ShipCard
              key={ship.id}
              ship={ship}
              placed={Boolean(placements[ship.id])}
              isNext={ship.id === nextShipId}
              orientation={pendingOrientation[ship.id]!}
              onDragStart={measureBoard}
              onDragMove={handleDragMove}
              onDrop={handleDrop}
              onRotate={() => handleRotate(ship.id)}
              onCancel={() => setPreview(null)}
            />
          ))}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.autoPlaceButton} onPress={handleAutoPlace}>
            <Icon type="refresh" color={colors.textPrimary} size={16} />
            <Text style={styles.autoPlaceText}>Auto-Place</Text>
          </Pressable>
          <Pressable
            style={styles.readyButtonWrapper}
            disabled={!allPlaced}
            onPress={() => onReady(placements)}
          >
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={[styles.readyButton, !allPlaced && styles.readyButtonDisabled]}
            >
              <Text style={styles.readyText}>READY →</Text>
            </GradientView>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  headerTimer: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cardBackground,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },
  gridRow: {
    flexDirection: 'row',
  },
  axisLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  tray: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  autoPlaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flex: 1,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  autoPlaceText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  readyButtonWrapper: {
    flex: 1,
  },
  readyButton: {
    height: 52,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyButtonDisabled: {
    opacity: 0.4,
  },
  readyText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
