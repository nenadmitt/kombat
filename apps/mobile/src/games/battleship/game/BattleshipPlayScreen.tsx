import { useEffect, useMemo, useState } from 'react';
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

import Icon from '../../../components/Icon';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import BattleshipGrid, { type PlacedShip } from '../BattleshipGrid';
import ShipGraphic from '../ShipGraphic';
import {
  COLUMN_LABELS,
  GRID,
  LABEL_GUTTER,
  ROW_LABELS,
  SHIPS,
} from '../setup/ship-placement.constants';
import type { Placement, Shot } from '../setup/ship-placement.types';
import { formatCountdown } from '../setup/ship-placement.utils';
import { OPPONENT_FLEET, resolveShot, sunkShipIds } from './opponent-fleet';

type Props = {
  placements: Record<string, Placement>;
  onExit: () => void;
};

type Mode = 'attack' | 'fleet';

const GLOW_COLOR = 'rgba(139, 92, 246, 0.3)';
const GLOW_HEIGHT = 420;
const TURN_SECONDS = 30;

const cellLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

/** The battle phase: attack the enemy waters, toggle to inspect your own fleet. */
export default function BattleshipPlayScreen({ placements, onExit }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [mode, setMode] = useState<Mode>('attack');
  const [shots, setShots] = useState<Shot[]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const shotAt = useMemo(
    () => new Set(shots.map(s => `${s.row},${s.col}`)),
    [shots],
  );
  const sunk = useMemo(() => sunkShipIds(OPPONENT_FLEET, shots), [shots]);
  const lastShot = shots.length ? shots[shots.length - 1]! : null;

  // Sunk enemy ships are revealed as hull silhouettes on the attack board.
  const revealedEnemy: PlacedShip[] = SHIPS.filter(s => sunk.has(s.id)).map(s => ({
    id: s.id,
    size: s.size,
    color: s.color,
    placement: OPPONENT_FLEET[s.id]!,
  }));

  // The player's own fleet, shown in the "fleet" view.
  const myFleet: PlacedShip[] = SHIPS.filter(s => placements[s.id]).map(s => ({
    id: s.id,
    size: s.size,
    color: s.color,
    placement: placements[s.id]!,
  }));

  const handleTarget = (row: number, col: number) => {
    if (shotAt.has(`${row},${col}`)) {
      return;
    }
    setSelected({ row, col });
  };

  const canFire = mode === 'attack' && selected !== null;

  const handleFire = () => {
    if (!selected) {
      return;
    }
    const result = resolveShot(selected.row, selected.col, OPPONENT_FLEET);
    setShots(prev => [...prev, { row: selected.row, col: selected.col, result }]);
    setSelected(null);
    setSecondsLeft(TURN_SECONDS);
  };

  const enemySunkCount = sunk.size;
  const isAttack = mode === 'attack';

  return (
    <SafeAreaView style={styles.screen}>
      <Canvas style={styles.glow}>
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
          <Text style={styles.headerLabel}>RANKED MATCH</Text>
          <Text style={styles.headerTitle}>Naval Clash</Text>
        </View>
        <Pressable style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Players + turn timer */}
        <View style={styles.playerBar}>
          <View style={styles.playerSide}>
            <View style={[styles.avatar, styles.avatarYou]}>
              <Text style={styles.avatarText}>Y</Text>
            </View>
            <View>
              <Text style={styles.playerName}>You</Text>
              <Text style={styles.playerSub}>0 / {SHIPS.length} sunk</Text>
            </View>
          </View>

          <View style={styles.turnBox}>
            <Text style={styles.turnTimer}>{formatCountdown(secondsLeft)}</Text>
            <Text style={styles.turnLabel}>YOUR TURN</Text>
          </View>

          <View style={[styles.playerSide, styles.playerSideRight]}>
            <View style={styles.playerRightText}>
              <Text style={styles.playerName}>Kraken</Text>
              <Text style={styles.playerSub}>
                {enemySunkCount} / {SHIPS.length} sunk
              </Text>
            </View>
            <View style={[styles.avatar, styles.avatarEnemy]}>
              <Text style={styles.avatarText}>K</Text>
            </View>
          </View>
        </View>

        {/* Attack / Fleet toggle */}
        <View style={styles.toggle}>
          <Pressable
            style={styles.toggleSegment}
            onPress={() => setMode('attack')}
          >
            {isAttack ? (
              <GradientView
                colors={brandGradient.colors}
                positions={brandGradient.positions}
                style={styles.toggleActive}
              >
                <Icon type="target" color={colors.textPrimary} size={16} />
                <Text style={styles.toggleTextActive}>ATTACK</Text>
              </GradientView>
            ) : (
              <View style={styles.toggleInactive}>
                <Icon type="target" color={colors.textMuted} size={16} />
                <Text style={styles.toggleText}>ATTACK</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.toggleSegment} onPress={() => setMode('fleet')}>
            {!isAttack ? (
              <GradientView
                colors={brandGradient.colors}
                positions={brandGradient.positions}
                style={styles.toggleActive}
              >
                <Icon type="anchor" color={colors.textPrimary} size={16} />
                <Text style={styles.toggleTextActive}>FLEET</Text>
              </GradientView>
            ) : (
              <View style={styles.toggleInactive}>
                <Icon type="anchor" color={colors.textMuted} size={16} />
                <Text style={styles.toggleText}>FLEET</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Grid heading */}
        <View style={styles.gridHeading}>
          <Text style={styles.gridTitle}>
            {isAttack ? 'ENEMY WATERS' : 'YOUR FLEET'}
          </Text>
          <Text style={styles.gridHint}>
            {isAttack ? 'Tap a cell to target' : 'Your deployed ships'}
          </Text>
        </View>

        {/* Column labels */}
        <View style={styles.gridRow}>
          <View style={{ width: LABEL_GUTTER }} />
          {COLUMN_LABELS.map(label => (
            <Text key={label} style={[styles.axisLabel, { width: cell }]}>
              {label}
            </Text>
          ))}
        </View>
        {/* Row labels + board */}
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

          {isAttack ? (
            <BattleshipGrid
              boardSize={boardSize}
              cell={cell}
              placedShips={revealedEnemy}
              shots={shots}
              selectedCell={selected}
              onCommit={handleTarget}
            />
          ) : (
            <BattleshipGrid boardSize={boardSize} cell={cell} placedShips={myFleet} />
          )}
        </View>

        {/* Last-shot result banner (attack only) */}
        {isAttack && lastShot && (
          <View
            style={[
              styles.banner,
              lastShot.result === 'hit' ? styles.bannerHit : styles.bannerMiss,
            ]}
          >
            <View
              style={[
                styles.bannerDot,
                {
                  backgroundColor:
                    lastShot.result === 'hit' ? colors.danger : colors.textMuted,
                },
              ]}
            />
            <Text style={styles.bannerText}>
              {lastShot.result === 'hit' ? 'DIRECT HIT' : 'MISS'} ·{' '}
              {cellLabel(lastShot.row, lastShot.col)}
            </Text>
          </View>
        )}

        {/* Enemy fleet remaining */}
        <View style={styles.fleetPanel}>
          <Text style={styles.sectionLabel}>ENEMY FLEET REMAINING</Text>
          <View style={styles.fleetRow}>
            {SHIPS.map(ship => {
              const isSunk = sunk.has(ship.id);
              return (
                <View key={ship.id} style={styles.fleetShip}>
                  <View style={isSunk && styles.fleetSunk}>
                    <ShipGraphic
                      cells={ship.size}
                      color={isSunk ? colors.textFaint : ship.color}
                      cellPx={9}
                      thickness={11}
                    />
                    {isSunk && <View style={styles.strike} />}
                  </View>
                  <Text style={[styles.fleetName, isSunk && styles.fleetNameSunk]}>
                    {ship.label}
                  </Text>
                  <View style={styles.dotsRow}>
                    {Array.from({ length: ship.size }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          { backgroundColor: isSunk ? colors.textFaint : ship.color },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Fire */}
      <View style={styles.fireBar}>
        <Pressable disabled={!canFire} onPress={handleFire}>
          <GradientView
            colors={brandGradient.colors}
            positions={brandGradient.positions}
            style={[styles.fireButton, !canFire && styles.fireButtonDisabled]}
          >
            <Icon type="target" color={colors.textPrimary} size={18} />
            <Text style={styles.fireText}>FIRE</Text>
          </GradientView>
        </Pressable>
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
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  playerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  playerSideRight: {
    justifyContent: 'flex-end',
  },
  playerRightText: {
    alignItems: 'flex-end',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: {
    backgroundColor: colors.brandStart,
  },
  avatarEnemy: {
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  playerName: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  playerSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  turnBox: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandStart,
  },
  turnTimer: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  turnLabel: {
    fontSize: 8,
    fontFamily: fonts.extraBold,
    color: colors.brandStart,
    letterSpacing: 0.5,
  },
  toggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.button,
    padding: 4,
    marginTop: spacing.sm,
  },
  toggleSegment: {
    flex: 1,
  },
  toggleActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
    borderRadius: radius.button - 4,
  },
  toggleInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 44,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  toggleTextActive: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  gridHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  gridTitle: {
    fontSize: 13,
    fontFamily: fonts.extraBold,
    color: colors.brandStart,
    letterSpacing: 0.5,
  },
  gridHint: {
    fontSize: 12,
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  bannerHit: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  bannerMiss: {
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  fleetPanel: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  fleetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fleetShip: {
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  fleetSunk: {
    opacity: 0.5,
    justifyContent: 'center',
  },
  strike: {
    position: 'absolute',
    left: -2,
    right: -2,
    top: '50%',
    height: 2,
    backgroundColor: colors.danger,
    transform: [{ rotate: '-12deg' }],
  },
  fleetName: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  fleetNameSunk: {
    color: colors.textFaint,
    textDecorationLine: 'line-through',
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
  fireBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  fireButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 54,
    borderRadius: radius.button,
  },
  fireButtonDisabled: {
    opacity: 0.4,
  },
  fireText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
});
