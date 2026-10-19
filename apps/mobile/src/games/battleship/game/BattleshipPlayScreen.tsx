import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import {
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
  type BattleshipEndReason,
  type FireKind,
  type MinePlacement,
  type StakeAsset,
  type VolleyStats,
} from '@gaming-platform/core';

import Icon from '../../../components/Icon';
import GameResultScreen from '../../../components/GameResultScreen';
import { GradientView } from '../../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../../theme/colors';
import { display, fonts, mono } from '../../../theme/typography';
import BattleshipGrid, {
  type GridAction,
  type PlacedShip,
} from '../BattleshipGrid';
import ShipGraphic from '../ShipGraphic';
import {
  COLUMN_LABELS,
  GRID,
  LABEL_GUTTER,
  MINE_COLOR,
  ROW_LABELS,
  SHIPS,
} from '../setup/ship-placement.constants';
import type { Shot } from '../setup/ship-placement.types';
import PowerupBar from './PowerupBar';
import TurnTimer from './TurnTimer';
import {
  bombCells,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  type PowerupKind,
} from './powerups';

type Mode = 'attack' | 'fleet';

export type BattleshipPlayScreenProps = {
  myFleet: PlacedShip[];
  myMines: MinePlacement[];
  myShots: Shot[];
  opponentShots: Shot[];
  revealedEnemyShips: PlacedShip[];
  points: number;
  powerupsUsed: Record<PowerupKind, number>;
  volleys: VolleyStats;
  myTurn: boolean;
  action: GridAction | null;
  opponentAction: GridAction | null;
  opponent: { initial: string; name: string };
  sunkByMe: number;
  sunkByOpponent: number;
  turnDeadline: number | null;
  myOnline: boolean;
  opponentOnline: boolean;
  result: 'win' | 'lose' | null;
  resultReason: BattleshipEndReason | null;
  stake?: { token: StakeAsset; amount: string } | null;
  onFire: (kind: FireKind, row: number, col: number) => void;
  onTimerExpire?: () => void;
  onExit: () => void;
  onQuit: () => void;
};

const GLOW_COLOR = 'rgba(142, 224, 90, 0.3)';
const GLOW_TRANSPARENT = 'rgba(142, 224, 90, 0)';
const GLOW_HEIGHT = 420;
const MODE_SWITCH_DELAY_MS = 1500;
const BOARD_FADE_MS = 320;

const cellLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

const RESULT_COPY: Record<
  'win' | 'lose',
  Record<BattleshipEndReason, { eyebrow: string; message: (name: string) => string }>
> = {
  win: {
    complete: {
      eyebrow: 'FLEET DESTROYED',
      message: () => 'You sank every enemy ship and dominated the waters.',
    },
    forfeit: {
      eyebrow: 'OPPONENT FORFEITED',
      message: name => `${name} abandoned the battle. The seas are yours.`,
    },
    timeout: {
      eyebrow: 'VICTORY BY TIMEOUT',
      message: name => `${name} ran out of time once too often. The win is yours.`,
    },
    'setup-timeout': {
      eyebrow: 'OPPONENT NEVER DEPLOYED',
      message: name => `${name} failed to deploy their fleet in time. The win is yours.`,
    },
  },
  lose: {
    complete: {
      eyebrow: 'FLEET LOST',
      message: () => 'Your fleet was wiped out. Regroup and strike back.',
    },
    forfeit: {
      eyebrow: 'MATCH FORFEITED',
      message: () => 'You forfeited the match and handed over the win.',
    },
    timeout: {
      eyebrow: 'LOST BY TIMEOUT',
      message: () => 'You ran out of time once too often and forfeited the match.',
    },
    'setup-timeout': {
      eyebrow: 'FLEET NEVER DEPLOYED',
      message: () => "You didn't deploy your fleet in time, so the match was forfeited.",
    },
  },
};

export default function BattleshipPlayScreen({
  myFleet,
  myMines,
  myShots,
  opponentShots,
  revealedEnemyShips,
  points,
  powerupsUsed,
  volleys,
  myTurn,
  action,
  opponentAction,
  opponent,
  sunkByMe,
  sunkByOpponent,
  turnDeadline,
  myOnline,
  opponentOnline,
  result,
  resultReason,
  stake,
  onFire,
  onTimerExpire,
  onExit,
  onQuit,
}: BattleshipPlayScreenProps) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - LABEL_GUTTER, 340);
  const cell = boardSize / GRID;

  const [mode, setMode] = useState<Mode>('attack');
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [armed, setArmed] = useState<PowerupKind | null>(null);
  const [powerupTarget, setPowerupTarget] = useState<{
    row: number;
    col: number;
  } | null>(null);

  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setArmed(null);
      setPowerupTarget(null);
    }
  }, [myTurn]);

  const prevTurn = useRef<boolean | null>(null);
  useEffect(() => {
    if (result) {
      return;
    }
    if (prevTurn.current === null || (myTurn && !prevTurn.current)) {
      Vibration.vibrate(300);
    }
    prevTurn.current = myTurn;
  }, [myTurn, result]);

  useEffect(() => {
    const timer = setTimeout(
      () => setMode(myTurn ? 'attack' : 'fleet'),
      MODE_SWITCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [myTurn]);

  useEffect(() => {
    if (opponentAction?.kind === 'mine') {
      setMode('fleet');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentAction?.id]);
  useEffect(() => {
    if (action?.kind === 'mine') {
      setMode('attack');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.id]);

  const shotAt = useMemo(
    () => new Set(myShots.map(s => `${s.row},${s.col}`)),
    [myShots],
  );
  const sunkEnemyIds = useMemo(
    () => new Set(revealedEnemyShips.map(s => s.id)),
    [revealedEnemyShips],
  );
  const lastShot = myShots.length ? myShots[myShots.length - 1]! : null;
  const lastIncoming = opponentShots.length
    ? opponentShots[opponentShots.length - 1]!
    : null;

  const handleArm = (kind: PowerupKind) => {
    if (points < POWERUP_COSTS[kind] || powerupsUsed[kind] >= POWERUP_MAX_USES) {
      return;
    }
    setArmed(prev => (prev === kind ? null : kind));
    setSelected(null);
    setPowerupTarget(null);
  };

  const handleGridCommit = useCallback(
    (row: number, col: number) => {
      if (!myTurn) {
        return;
      }
      if (armed) {
        setPowerupTarget({ row, col });
        return;
      }
      if (shotAt.has(`${row},${col}`)) {
        return;
      }
      setSelected({ row, col });
    },
    [myTurn, armed, shotAt],
  );

  // The torpedo previews the whole row so the enemy stays hidden; bombCells on an empty fleet is used only for its clamped geometry.
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
    return bombCells(powerupTarget.row, powerupTarget.col, {}).map(s => ({
      row: s.row,
      col: s.col,
    }));
  }, [armed, powerupTarget]);

  const canFire =
    myTurn &&
    mode === 'attack' &&
    (armed
      ? powerupTarget !== null && points >= POWERUP_COSTS[armed]
      : selected !== null);

  const handleFire = () => {
    if (armed && powerupTarget) {
      if (points < POWERUP_COSTS[armed]) {
        return;
      }
      onFire(armed, powerupTarget.row, powerupTarget.col);
      setArmed(null);
      setPowerupTarget(null);
      return;
    }
    if (selected) {
      onFire('single', selected.row, selected.col);
      setSelected(null);
    }
  };

  const isAttack = mode === 'attack';
  const bannerShot = isAttack ? lastShot : lastIncoming;

  const attackFade = useSharedValue(isAttack ? 1 : 0);
  useEffect(() => {
    attackFade.value = withTiming(isAttack ? 1 : 0, { duration: BOARD_FADE_MS });
  }, [isAttack, attackFade]);
  const attackBoardStyle = useAnimatedStyle(() => ({ opacity: attackFade.value }));
  const fleetBoardStyle = useAnimatedStyle(() => ({
    opacity: 1 - attackFade.value,
  }));

  const handleHeaderBack = onExit;

  if (result) {
    // Accuracy is per volley: any cell striking a ship counts, so bomb splash misses don't drag it down.
    const shotsFired = volleys.fired;
    const hitsLanded = volleys.hit;
    const accuracy = shotsFired ? Math.round((hitsLanded / shotsFired) * 100) : 0;
    const stats = [
      { value: `${shotsFired}`, label: 'SHOTS FIRED' },
      { value: `${hitsLanded}`, label: 'HITS LANDED', highlight: true },
      { value: `${accuracy}%`, label: 'ACCURACY' },
      { value: `${sunkByMe} / ${SHIPS.length}`, label: 'SHIPS SUNK', highlight: true },
    ];
    if (stake) {
      // The pot, not net winnings: the fee is applied at settlement.
      const symbol = STAKE_ASSET_SYMBOLS[stake.token];
      const amount = formatStakeAmount(stake.amount, stake.token);
      const pot = formatStakeAmount(
        (BigInt(stake.amount) * 2n).toString(),
        stake.token,
      );
      stats.push(
        result === 'win'
          ? { value: `${pot} ${symbol}`, label: 'POT WON', highlight: true }
          : { value: `${amount} ${symbol}`, label: 'STAKE LOST' },
      );
    }
    const copy = RESULT_COPY[result][resultReason ?? 'complete'];
    return result === 'win' ? (
      <GameResultScreen
        variant="win"
        icon="trophy"
        eyebrow={copy.eyebrow}
        title="VICTORY"
        message={copy.message(opponent.name)}
        opponent={{ initial: opponent.initial, label: 'DEFEATED', name: opponent.name }}
        stats={stats}
        onBack={onQuit}
      />
    ) : (
      <GameResultScreen
        variant="lose"
        icon="anchor"
        eyebrow={copy.eyebrow}
        title="DEFEAT"
        message={copy.message(opponent.name)}
        opponent={{ initial: opponent.initial, label: 'LOST TO', name: opponent.name }}
        stats={stats}
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
            colors={[GLOW_COLOR, GLOW_TRANSPARENT]}
          />
        </Fill>
      </Canvas>

      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={handleHeaderBack}>
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
        <View style={styles.playerBar}>
          <View style={styles.playerSide}>
            <View style={[styles.avatar, styles.avatarYou]}>
              <Text style={styles.avatarText}>Y</Text>
              <View
                style={[
                  styles.presenceDot,
                  { backgroundColor: myOnline ? colors.success : colors.danger },
                ]}
              />
            </View>
            <View>
              <Text style={styles.playerName}>You</Text>
              <Text style={styles.playerSub}>
                {sunkByOpponent} / {SHIPS.length} sunk
              </Text>
            </View>
          </View>

          <View style={styles.turnBox}>
            <TurnTimer
              deadline={turnDeadline}
              onExpire={onTimerExpire}
              style={styles.turnTimer}
            />
            <Text style={styles.turnLabel}>
              {myTurn ? 'YOUR TURN' : 'THEIR TURN'}
            </Text>
          </View>

          <View style={[styles.playerSide, styles.playerSideRight]}>
            <View style={styles.playerRightText}>
              <Text style={styles.playerName} numberOfLines={1}>
                {opponent.name}
              </Text>
              <Text style={styles.playerSub}>
                {sunkByMe} / {SHIPS.length} sunk
              </Text>
            </View>
            <View style={[styles.avatar, styles.avatarEnemy]}>
              <Text style={styles.avatarText}>{opponent.initial}</Text>
              <View
                style={[
                  styles.presenceDot,
                  {
                    backgroundColor: opponentOnline
                      ? colors.success
                      : colors.danger,
                  },
                ]}
              />
            </View>
          </View>
        </View>

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

        <View style={styles.gridHeading}>
          <Text style={styles.gridTitle}>
            {isAttack ? 'ENEMY WATERS' : 'YOUR FLEET'}
          </Text>
          <Text style={[styles.gridHint, isAttack && armed && styles.gridHintArmed]}>
            {!isAttack
              ? 'Incoming fire'
              : !myTurn
                ? "Opponent's turn"
                : armed === 'torpedo'
                  ? 'Tap a row, then Fire'
                  : armed === 'bomb'
                    ? 'Tap an area, then Fire'
                    : 'Tap a cell to target'}
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

          {/* Opacity, not `display`: display tears down the Skia surface and leaves it blank on the way back. */}
          <View style={{ width: boardSize, height: boardSize }}>
            <Animated.View
              style={[styles.boardLayer, attackBoardStyle]}
              pointerEvents={isAttack ? 'auto' : 'none'}
            >
              <BattleshipGrid
                boardSize={boardSize}
                cell={cell}
                placedShips={revealedEnemyShips}
                shots={myShots}
                selectedCell={armed ? null : selected}
                previewCells={previewCells}
                action={action}
                onCommit={handleGridCommit}
              />
            </Animated.View>
            <Animated.View
              style={[styles.boardLayer, fleetBoardStyle]}
              pointerEvents={isAttack ? 'none' : 'auto'}
            >
              <BattleshipGrid
                boardSize={boardSize}
                cell={cell}
                placedShips={myFleet}
                mines={myMines}
                shots={opponentShots}
                action={opponentAction}
              />
            </Animated.View>
          </View>
        </View>

        {bannerShot && (
          <View
            style={[
              styles.banner,
              bannerShot.result === 'hit'
                ? styles.bannerHit
                : bannerShot.result === 'mine'
                  ? styles.bannerMine
                  : styles.bannerMiss,
            ]}
          >
            <View
              style={[
                styles.bannerDot,
                {
                  backgroundColor:
                    bannerShot.result === 'hit'
                      ? colors.danger
                      : bannerShot.result === 'mine'
                        ? MINE_COLOR
                        : colors.textMuted,
                },
              ]}
            />
            <Text style={styles.bannerText}>
              {bannerShot.result === 'hit'
                ? 'DIRECT HIT'
                : bannerShot.result === 'mine'
                  ? 'MINE STRUCK'
                  : 'MISS'}{' '}
              · {cellLabel(bannerShot.row, bannerShot.col)}
            </Text>
          </View>
        )}

        {isAttack && (
          <PowerupBar
            points={points}
            used={powerupsUsed}
            armed={armed}
            onArm={handleArm}
          />
        )}

        <View style={styles.fleetPanel}>
          <Text style={styles.sectionLabel}>ENEMY FLEET REMAINING</Text>
          <View style={styles.fleetRow}>
            {SHIPS.map(ship => {
              const isSunk = sunkEnemyIds.has(ship.id);
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
    fontSize: 10,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: display.bold,
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
    flexShrink: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarYou: {
    backgroundColor: colors.brandStart,
  },
  avatarEnemy: {
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: display.bold,
    color: colors.textPrimary,
  },
  playerName: {
    fontSize: 14,
    fontFamily: display.semiBold,
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
    fontFamily: mono.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  turnLabel: {
    fontSize: 8,
    fontFamily: mono.bold,
    color: colors.accent,
    letterSpacing: 1,
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
    fontFamily: mono.bold,
    color: colors.accent,
    letterSpacing: 1,
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
  boardLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  axisLabel: {
    fontSize: 11,
    fontFamily: mono.medium,
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
    borderColor: 'rgba(255, 84, 104, 0.5)',
    backgroundColor: 'rgba(255, 84, 104, 0.1)',
  },
  bannerMiss: {
    borderColor: colors.cardBorder,
    backgroundColor: colors.cardBackground,
  },
  bannerMine: {
    borderColor: 'rgba(251, 191, 36, 0.5)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
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
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
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
