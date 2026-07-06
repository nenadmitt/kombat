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

import Icon from '../../../components/Icon';
import GameResultScreen from '../../../components/GameResultScreen';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import BattleshipGrid, {
  type GridAction,
  type PlacedShip,
} from '../BattleshipGrid';
import ShipGraphic from '../ShipGraphic';
import {
  COLUMN_LABELS,
  GRID,
  LABEL_GUTTER,
  ROW_LABELS,
  SHIPS,
} from '../setup/ship-placement.constants';
import type { Placement, Shot } from '../setup/ship-placement.types';
import { OPPONENT_FLEET, resolveShot, sunkShipIds } from './opponent-fleet';
import PowerupBar from './PowerupBar';
import TurnTimer from './TurnTimer';
import {
  bombCells,
  POINTS_PER_HIT,
  POWERUP_COST,
  type PowerupKind,
  torpedoCells,
} from './powerups';

type Props = {
  placements: Record<string, Placement>;
  onExit: () => void;
  /** Leave the game entirely (used by the win/lose result screen). */
  onQuit: () => void;
};

type Mode = 'attack' | 'fleet';

const GLOW_COLOR = 'rgba(139, 92, 246, 0.3)';
const GLOW_HEIGHT = 420;
const TURN_SECONDS = 30;

const cellLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

/** The battle phase: attack the enemy waters, toggle to inspect your own fleet. */
export default function BattleshipPlayScreen({ placements, onExit, onQuit }: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [mode, setMode] = useState<Mode>('attack');
  const [shots, setShots] = useState<Shot[]>([]);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [points, setPoints] = useState(0);
  const [armed, setArmed] = useState<PowerupKind | null>(null);
  // Where an armed power-up will strike once FIRE is pressed.
  const [powerupTarget, setPowerupTarget] = useState<{
    row: number;
    col: number;
  } | null>(null);
  // The most recent shot batch, handed to the grid to animate. The id bumps
  // on every action so the grid replays even when the same cells repeat.
  const [action, setAction] = useState<GridAction | null>(null);
  const actionId = useRef(0);
  // Set when the turn timer runs out — the only way to lose in this
  // single-player prototype (the opponent doesn't fire back).
  const [lost, setLost] = useState(false);

  const shotAt = useMemo(
    () => new Set(shots.map(s => `${s.row},${s.col}`)),
    [shots],
  );
  const sunk = useMemo(() => sunkShipIds(OPPONENT_FLEET, shots), [shots]);
  const lastShot = shots.length ? shots[shots.length - 1]! : null;

  // Sunk enemy ships are revealed as hull silhouettes on the attack board.
  const revealedEnemy: PlacedShip[] = useMemo(
    () =>
      SHIPS.filter(s => sunk.has(s.id)).map(s => ({
        id: s.id,
        size: s.size,
        color: s.color,
        placement: OPPONENT_FLEET[s.id]!,
      })),
    [sunk],
  );

  // The player's own fleet, shown in the "fleet" view.
  const myFleet: PlacedShip[] = useMemo(
    () =>
      SHIPS.filter(s => placements[s.id]).map(s => ({
        id: s.id,
        size: s.size,
        color: s.color,
        placement: placements[s.id]!,
      })),
    [placements],
  );

  // Commit a batch of shots (single, torpedo, or bomb), skipping cells already
  // fired at, and hand the newly-added cells to the grid to animate.
  // Commit a batch of shots, skip cells already fired at, hand the newly-added
  // cells to the grid to animate, and award a point per fresh hit.
  const applyShots = (batch: Shot[], kind: GridAction['kind']) => {
    const added = batch.filter(s => !shotAt.has(`${s.row},${s.col}`));
    if (added.length === 0) {
      return;
    }
    const earned = added.filter(s => s.result === 'hit').length * POINTS_PER_HIT;
    setShots(prev => [...prev, ...added]);
    setPoints(p => p + earned);
    actionId.current += 1;
    setAction({ id: actionId.current, kind, cells: added });
  };

  const handleArm = (kind: PowerupKind) => {
    if (points < POWERUP_COST) {
      return;
    }
    setArmed(prev => (prev === kind ? null : kind));
    setSelected(null);
    setPowerupTarget(null);
  };

  // A grid tap only *selects* a target — firing happens via the FIRE button.
  // Memoized so the memoized BattleshipGrid can skip re-renders when unrelated
  // state (points, animation batch, etc.) changes.
  const handleGridCommit = useCallback(
    (row: number, col: number) => {
      if (armed) {
        setPowerupTarget({ row, col });
        return;
      }
      if (shotAt.has(`${row},${col}`)) {
        return;
      }
      setSelected({ row, col });
    },
    [armed, shotAt],
  );

  // Cells an armed power-up would strike (row for torpedo, 3x3 for bomb). The
  // torpedo previews the whole row so the enemy's position stays hidden.
  const previewCells = useMemo(() => {
    if (!armed || !powerupTarget) {
      return undefined;
    }
    if (armed === 'torpedo') {
      return Array.from({ length: GRID }, (_, c) => ({
        row: powerupTarget.row,
        col: c,
      }));
    }
    return bombCells(powerupTarget.row, powerupTarget.col, OPPONENT_FLEET).map(
      s => ({ row: s.row, col: s.col }),
    );
  }, [armed, powerupTarget]);

  const canFire =
    mode === 'attack' &&
    (armed ? powerupTarget !== null && points >= POWERUP_COST : selected !== null);

  const handleFire = () => {
    if (armed && powerupTarget) {
      if (points < POWERUP_COST) {
        return;
      }
      const batch =
        armed === 'torpedo'
          ? torpedoCells(powerupTarget.row, OPPONENT_FLEET)
          : bombCells(powerupTarget.row, powerupTarget.col, OPPONENT_FLEET);
      applyShots(batch, armed);
      setPoints(p => p - POWERUP_COST);
      setArmed(null);
      setPowerupTarget(null);
      return;
    }
    if (!selected) {
      return;
    }
    const result = resolveShot(selected.row, selected.col, OPPONENT_FLEET);
    applyShots([{ row: selected.row, col: selected.col, result }], 'single');
    setSelected(null);
  };

  const enemySunkCount = sunk.size;
  const isAttack = mode === 'attack';

  // Win the moment every enemy ship is sunk (takes precedence over a timeout).
  const won = enemySunkCount === SHIPS.length;
  const result: 'win' | 'lose' | null = won ? 'win' : lost ? 'lose' : null;

  if (result) {
    const shotsFired = shots.length;
    const hitsLanded = shots.filter(s => s.result === 'hit').length;
    const accuracy = shotsFired ? Math.round((hitsLanded / shotsFired) * 100) : 0;
    const stats = [
      { value: `${shotsFired}`, label: 'SHOTS FIRED' },
      { value: `${hitsLanded}`, label: 'HITS LANDED', highlight: true },
      { value: `${accuracy}%`, label: 'ACCURACY' },
      { value: `${enemySunkCount} / ${SHIPS.length}`, label: 'SHIPS SUNK', highlight: true },
    ];
    return won ? (
      <GameResultScreen
        variant="win"
        icon="trophy"
        eyebrow="FLEET DESTROYED"
        title="VICTORY"
        message="You sank every enemy ship and dominated the waters."
        opponent={{ initial: 'K', label: 'DEFEATED', name: 'Kraken_92' }}
        stats={stats}
        rankProgress={{
          delta: '+24 RP',
          fillPct: 0.6,
          rankLabel: 'Commodore II',
          nextLabel: '128 RP to Admiral',
        }}
        onBack={onQuit}
      />
    ) : (
      <GameResultScreen
        variant="lose"
        icon="anchor"
        eyebrow="FLEET LOST"
        title="DEFEAT"
        message="Your fleet was wiped out. Regroup and strike back."
        opponent={{ initial: 'K', label: 'LOST TO', name: 'Kraken_92' }}
        stats={stats}
        rankProgress={{
          delta: '-12 RP',
          fillPct: 0.2,
          rankLabel: 'Commodore I',
          nextLabel: '186 RP to next',
        }}
        onBack={onQuit}
      />
    );
  }

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
            <TurnTimer
              seconds={TURN_SECONDS}
              resetSignal={action?.id ?? 0}
              onExpire={() => setLost(true)}
              style={styles.turnTimer}
            />
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
          <Text style={[styles.gridHint, armed && styles.gridHintArmed]}>
            {!isAttack
              ? 'Your deployed ships'
              : armed === 'torpedo'
                ? 'Tap a row, then Fire'
                : armed === 'bomb'
                  ? 'Tap an area, then Fire'
                  : 'Tap a cell to target'}
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
              selectedCell={armed ? null : selected}
              previewCells={previewCells}
              action={action}
              onCommit={handleGridCommit}
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

        {/* Power-ups (attack only) */}
        {isAttack && (
          <PowerupBar points={points} armed={armed} onArm={handleArm} />
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
            <Icon
              type={armed === 'torpedo' ? 'rocket' : armed === 'bomb' ? 'bomb' : 'target'}
              color={colors.textPrimary}
              size={18}
            />
            <Text style={styles.fireText}>{armed ? 'LAUNCH' : 'FIRE'}</Text>
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
  gridHintArmed: {
    fontFamily: fonts.bold,
    color: colors.brandStart,
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
