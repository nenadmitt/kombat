import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';

import Icon from '../../../components/Icon';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import BattleshipGrid from '../BattleshipGrid';
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
import type { Orientation, Placement } from './ship-placement.types';
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

// colors.brandStart at reduced opacity, for the top glow behind the header.
const GLOW_COLOR = 'rgba(139, 92, 246, 0.35)';
const GLOW_HEIGHT = 480;

/** "Deploy Your Fleet" — select a ship, then tap the grid to place it. */
export default function BattleshipSetupScreen({ onReady, onExit }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [pendingOrientation, setPendingOrientation] = useState<
    Record<string, Orientation>
  >(Object.fromEntries(SHIPS.map(s => [s.id, 'h' as Orientation])));
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SETUP_DURATION_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const nextShipId = SHIPS.find(s => !placements[s.id])?.id;
  const activeShipId = selectedShipId ?? nextShipId;

  const handleSelect = (shipId: string) => {
    setSelectedShipId(shipId);
  };

  const handleRotate = (shipId: string) => {
    setPendingOrientation(prev => ({
      ...prev,
      [shipId]: prev[shipId] === 'h' ? 'v' : 'h',
    }));
  };

  const handleRemove = (shipId: string) => {
    setPlacements(prev => {
      const { [shipId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const handlePlaceActive = (row: number, col: number) => {
    if (!activeShipId) {
      return;
    }
    const ship = SHIP_BY_ID[activeShipId]!;
    const orientation = pendingOrientation[activeShipId]!;
    const cells = cellsFor({ row, col, orientation }, ship.size);
    if (!canPlace(cells, buildOccupied(placements))) {
      return;
    }
    setPlacements(prev => ({ ...prev, [activeShipId]: { row, col, orientation } }));
    setSelectedShipId(null);
  };

  const getPreview = (row: number, col: number) => {
    if (!activeShipId) {
      return null;
    }
    const ship = SHIP_BY_ID[activeShipId]!;
    const orientation = pendingOrientation[activeShipId]!;
    const cells = cellsFor({ row, col, orientation }, ship.size);
    return { cells, valid: canPlace(cells, buildOccupied(placements)) };
  };

  const handleGridTap = (row: number, col: number) => {
    const occupantId = Object.keys(placements).find(id =>
      cellsFor(placements[id]!, SHIP_BY_ID[id]!.size).some(
        c => c.r === row && c.c === col,
      ),
    );
    if (occupantId) {
      handleRemove(occupantId);
    } else {
      handlePlaceActive(row, col);
    }
  };

  const handleAutoPlace = () => {
    let next = { ...placements };
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
    setSelectedShipId(null);
  };

  const placedCount = Object.keys(placements).length;
  const allPlaced = placedCount === SHIPS.length;
  const occupied = buildOccupied(placements);

  return (
    <SafeAreaView style={styles.screen}>
      <Canvas style={styles.glow} pointerEvents="none">
        <Fill>
          <RadialGradient
            c={vec(width / 2, 0)}
            r={GLOW_HEIGHT}
            colors={[GLOW_COLOR, 'rgba(139, 92, 246, 0)']}
          />
        </Fill>
      </Canvas>

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
          Select a ship below, then tap or drag on the grid to place it.
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

          <BattleshipGrid
            boardSize={boardSize}
            cell={cell}
            occupied={occupied}
            active={Boolean(activeShipId)}
            getPreview={getPreview}
            onCommit={handleGridTap}
          />
        </View>

        <Text style={styles.sectionLabel}>YOUR SHIPS</Text>
        <View style={styles.tray}>
          {SHIPS.map(ship => (
            <ShipCard
              key={ship.id}
              ship={ship}
              placed={Boolean(placements[ship.id])}
              selected={ship.id === activeShipId}
              orientation={pendingOrientation[ship.id]!}
              onSelect={() => handleSelect(ship.id)}
              onRotate={() => handleRotate(ship.id)}
              onRemove={() => handleRemove(ship.id)}
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
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
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
