import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import {
  MINES_PER_PLAYER,
  randomFleet,
  randomMines,
  type MinePlacement,
} from '@gaming-platform/core';

import Icon from '../../../components/Icon';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { display, fonts, mono } from '../../../theme/typography';
import BattleshipGrid from '../BattleshipGrid';
import MineCard from './MineCard';
import ShipCard from './ShipCard';
import {
  COLUMN_LABELS,
  GRID,
  LABEL_GUTTER,
  MINE_COLOR,
  ROW_LABELS,
  SETUP_DURATION_SECONDS,
  SHIPS,
  SHIP_BY_ID,
} from './ship-placement.constants';
import TurnTimer from '../game/TurnTimer';
import type { Orientation, Placement } from './ship-placement.types';
import { buildOccupied, canPlace, cellsFor } from './ship-placement.utils';

type Props = {
  onReady: (
    placements: Record<string, Placement>,
    mines: MinePlacement[],
  ) => void;
  onExit: () => void;
};

/** Pseudo-id for the mines tray card (ship ids come from the fleet spec). */
const MINES_ID = 'mines';

// colors.accent at reduced opacity, for the top glow behind the header.
const GLOW_COLOR = 'rgba(142, 224, 90, 0.35)';
const GLOW_TRANSPARENT = 'rgba(142, 224, 90, 0)';
const GLOW_HEIGHT = 480;

/** "Deploy Your Fleet" - select a ship, then tap the grid to place it. */
export default function BattleshipSetupScreen({ onReady, onExit }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [mines, setMines] = useState<MinePlacement[]>([]);
  // A single orientation shared by every ship, toggled from the "Placing" row.
  const [orientation, setOrientation] = useState<Orientation>('h');
  // A ship id, MINES_ID, or null (auto-advance to the next unplaced item).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A fixed deadline for the setup countdown, computed once on mount.
  const setupDeadline = useRef(
    Date.now() + SETUP_DURATION_SECONDS * 1000,
  ).current;

  const minesLeft = MINES_PER_PLAYER - mines.length;
  const nextId =
    SHIPS.find(s => !placements[s.id])?.id ??
    (minesLeft > 0 ? MINES_ID : undefined);
  const activeId = selectedId ?? nextId;
  const placingMine = activeId === MINES_ID;

  // Ships and mines block each other, so placement checks span both.
  const occupiedAll = useMemo(() => {
    const set = buildOccupied(placements);
    for (const m of mines) {
      set.add(`${m.row},${m.col}`);
    }
    return set;
  }, [placements, mines]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleRotate = () => {
    setOrientation(prev => (prev === 'h' ? 'v' : 'h'));
  };

  const handleRemove = useCallback((shipId: string) => {
    setPlacements(prev => {
      const { [shipId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const handlePlaceActive = useCallback(
    (row: number, col: number) => {
      if (!activeId) {
        return;
      }
      if (activeId === MINES_ID) {
        if (mines.length >= MINES_PER_PLAYER || occupiedAll.has(`${row},${col}`)) {
          return;
        }
        setMines(prev => [...prev, { row, col }]);
        // Keep placing mines until the full set is armed.
        setSelectedId(mines.length + 1 < MINES_PER_PLAYER ? MINES_ID : null);
        return;
      }
      const ship = SHIP_BY_ID[activeId]!;
      const cells = cellsFor({ row, col, orientation }, ship.size);
      if (!canPlace(cells, occupiedAll)) {
        return;
      }
      setPlacements(prev => ({ ...prev, [activeId]: { row, col, orientation } }));
      setSelectedId(null);
    },
    [activeId, orientation, mines, occupiedAll],
  );

  const isValidPlacement = useCallback(
    (row: number, col: number) => {
      if (!activeId) {
        return false;
      }
      if (activeId === MINES_ID) {
        return !occupiedAll.has(`${row},${col}`);
      }
      const ship = SHIP_BY_ID[activeId]!;
      const cells = cellsFor({ row, col, orientation }, ship.size);
      return canPlace(cells, occupiedAll);
    },
    [activeId, orientation, occupiedAll],
  );

  const handleGridCommit = useCallback(
    (row: number, col: number, isTap: boolean) => {
      // Only a deliberate tap removes a placed ship or mine - releasing a drag
      // over an occupied cell is just an invalid drop and should do nothing,
      // otherwise a missed drop silently deletes something already placed.
      if (isTap) {
        const mineIdx = mines.findIndex(m => m.row === row && m.col === col);
        if (mineIdx !== -1) {
          setMines(prev => prev.filter((_, i) => i !== mineIdx));
          return;
        }
        const occupantId = Object.keys(placements).find(id =>
          cellsFor(placements[id]!, SHIP_BY_ID[id]!.size).some(
            c => c.r === row && c.c === col,
          ),
        );
        if (occupantId) {
          handleRemove(occupantId);
          return;
        }
      }
      handlePlaceActive(row, col);
    },
    [placements, mines, handleRemove, handlePlaceActive],
  );

  // A full reshuffle every tap - existing placements are thrown away so the
  // player can keep rolling layouts until one looks right, then hit READY.
  const handleAutoPlace = () => {
    const next = randomFleet();
    setPlacements(next);
    setMines(randomMines(next));
    setSelectedId(null);
  };

  const placedCount = Object.keys(placements).length + mines.length;
  const totalToPlace = SHIPS.length + MINES_PER_PLAYER;
  const allPlaced = placedCount === totalToPlace;
  const activeShip =
    activeId && activeId !== MINES_ID ? SHIP_BY_ID[activeId] : undefined;
  const placedShips = useMemo(
    () =>
      SHIPS.filter(s => placements[s.id]).map(s => ({
        id: s.id,
        size: s.size,
        color: s.color,
        placement: placements[s.id]!,
      })),
    [placements],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Canvas style={styles.glow}>
        <Fill>
          <RadialGradient
            c={vec(width / 2, 0)}
            r={GLOW_HEIGHT}
            colors={[GLOW_COLOR, GLOW_TRANSPARENT]}
          />
        </Fill>
      </Canvas>

      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={onExit}>
          <Icon type="chevron-left" color={colors.textPrimary} size={20} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerLabel}>BATTLE STARTS IN</Text>
          <TurnTimer deadline={setupDeadline} style={styles.headerTimer} />
        </View>
        <Pressable style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Deploy Your Fleet</Text>
        <Text style={styles.subtitle}>
          Select a ship or your mines below, then tap or drag on the grid to
          place them.
        </Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={[
                styles.progressFill,
                { width: `${(placedCount / totalToPlace) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {placedCount} / {totalToPlace} placed
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

          <BattleshipGrid
            boardSize={boardSize}
            cell={cell}
            placedShips={placedShips}
            mines={mines}
            activeShip={activeShip ?? null}
            activeMine={placingMine}
            orientation={orientation}
            isValidPlacement={isValidPlacement}
            onCommit={handleGridCommit}
          />
        </View>

        {activeShip ? (
          <View style={styles.placingRow}>
            <Text style={styles.placingText}>
              Placing{' '}
              <Text style={[styles.placingName, { color: activeShip.color }]}>
                {activeShip.label}
              </Text>
            </Text>
            <Pressable style={styles.rotatePill} onPress={handleRotate}>
              <Icon type="rotate-cw" color={colors.textPrimary} size={13} />
              <Text style={styles.rotatePillText}>
                {orientation === 'h' ? 'Horizontal' : 'Vertical'}
              </Text>
            </Pressable>
          </View>
        ) : placingMine ? (
          <View style={styles.placingRow}>
            <Text style={styles.placingText}>
              Placing{' '}
              <Text style={[styles.placingName, { color: MINE_COLOR }]}>
                Sea Mine
              </Text>{' '}
              · {minesLeft} left
            </Text>
          </View>
        ) : (
          <View style={styles.placingRow}>
            <View style={styles.deployedRow}>
              <Icon type="check" color={colors.success} size={14} />
              <Text style={styles.deployedText}>Fleet and mines deployed</Text>
            </View>
          </View>
        )}

        <View style={styles.fleetPanel}>
          <Text style={styles.sectionLabel}>YOUR FLEET & MINES</Text>
          <View style={styles.tray}>
            {SHIPS.map(ship => (
              <ShipCard
                key={ship.id}
                ship={ship}
                placed={Boolean(placements[ship.id])}
                selected={ship.id === activeId}
                onSelect={() => handleSelect(ship.id)}
                onRemove={() => handleRemove(ship.id)}
              />
            ))}
            <MineCard
              placedCount={mines.length}
              selected={placingMine}
              onSelect={() => handleSelect(MINES_ID)}
            />
          </View>
          <Text style={styles.minesBlurb}>
            An enemy shot that strikes a mine blasts a 3×3 area of their own
            fleet and ends their turn.
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.autoPlaceButton} onPress={handleAutoPlace}>
            <Icon type="refresh" color={colors.textPrimary} size={16} />
            <Text style={styles.autoPlaceText}>Auto-Place</Text>
          </Pressable>
          <Pressable
            style={styles.readyButtonWrapper}
            disabled={!allPlaced}
            onPress={() => onReady(placements, mines)}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
    pointerEvents: 'none',
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
    fontSize: 10,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  headerTimer: {
    fontSize: 16,
    fontFamily: mono.bold,
    color: colors.textPrimary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontFamily: display.bold,
    letterSpacing: -0.3,
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
    marginTop: spacing.sm,
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
    fontFamily: mono.medium,
    color: colors.textMuted,
  },
  gridRow: {
    flexDirection: 'row',
  },
  axisLabel: {
    fontSize: 11,
    fontFamily: mono.medium,
    color: colors.textMuted,
    textAlign: 'center',
  },
  placingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    minHeight: 30,
  },
  placingText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  placingName: {
    fontFamily: display.bold,
  },
  rotatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  rotatePillText: {
    fontSize: 11,
    fontFamily: mono.medium,
    color: colors.textPrimary,
  },
  deployedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deployedText: {
    fontSize: 12,
    fontFamily: mono.semiBold,
    color: colors.success,
  },
  fleetPanel: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  tray: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  minesBlurb: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
