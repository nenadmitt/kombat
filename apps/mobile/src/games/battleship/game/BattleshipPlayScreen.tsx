import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import type { BattleshipEndReason, FireKind } from '@gaming-platform/core';

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
import type { Shot } from '../setup/ship-placement.types';
import PowerupBar from './PowerupBar';
import TurnTimer from './TurnTimer';
import { bombCells, POWERUP_COST, type PowerupKind } from './powerups';

type Mode = 'attack' | 'fleet';

export type BattleshipPlayScreenProps = {
  /** My own placed fleet (fleet view). */
  myFleet: PlacedShip[];
  /** Shots I have fired (attack view markers). */
  myShots: Shot[];
  /** Shots the opponent has fired at me (fleet view markers). */
  opponentShots: Shot[];
  /** Sunk enemy ships, revealed on the attack view. */
  revealedEnemyShips: PlacedShip[];
  /** My charge points. */
  points: number;
  /** Whether it's my turn (gates FIRE + hint treatment). */
  myTurn: boolean;
  /** Animation batch for my most recent shot (attack view). */
  action: GridAction | null;
  /** Animation batch for the opponent's most recent shot (fleet view). */
  opponentAction: GridAction | null;
  opponent: { initial: string; name: string };
  /** Enemy ships I've sunk / my ships the opponent has sunk (header counts). */
  sunkByMe: number;
  sunkByOpponent: number;
  /** Epoch ms the current turn ends (null outside an active turn). */
  turnDeadline: number | null;
  /** Socket connection indicators. */
  myOnline: boolean;
  opponentOnline: boolean;
  result: 'win' | 'lose' | null;
  /** Why the match ended (drives the result-screen copy). */
  resultReason: BattleshipEndReason | null;
  onFire: (kind: FireKind, row: number, col: number) => void;
  onTimerExpire?: () => void;
  /** Header back — leaving an in-progress match forfeits it. */
  onExit: () => void;
  onQuit: () => void;
};

const GLOW_COLOR = 'rgba(139, 92, 246, 0.3)';
const GLOW_HEIGHT = 420;
/** Pause before auto-switching boards so the last shot's markers are seen. */
const MODE_SWITCH_DELAY_MS = 1500;
/** Cross-fade duration when the attack/fleet boards swap. */
const BOARD_FADE_MS = 320;

const cellLabel = (row: number, col: number) => `${COLUMN_LABELS[col]}${row + 1}`;

/** Result-screen copy per outcome and end reason. */
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

/**
 * Pure-UI battle screen: renders entirely from props and reports intents via
 * callbacks. It never resolves shots — an engine (demo bot or multiplayer
 * socket) owns the game state and feeds it back in. Only view-local interaction
 * state (mode, selection, armed power-up) lives here.
 */
export default function BattleshipPlayScreen({
  myFleet,
  myShots,
  opponentShots,
  revealedEnemyShips,
  points,
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

  // Clear any pending selection whenever the turn leaves me.
  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setArmed(null);
      setPowerupTarget(null);
    }
  }, [myTurn]);

  // Nudge: a short buzz when the battle screen appears and whenever the turn
  // becomes mine (no-op on simulators — vibration needs a physical device).
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

  // Follow the action: my turn shows enemy waters, the opponent's turn shows
  // my fleet. The switch is delayed a beat so the shot that ended the turn is
  // still visible; the manual toggle keeps working in between.
  useEffect(() => {
    const timer = setTimeout(
      () => setMode(myTurn ? 'attack' : 'fleet'),
      MODE_SWITCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [myTurn]);

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
    if (points < POWERUP_COST) {
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

  // Cells an armed power-up would strike (row for torpedo, 3x3 for bomb). The
  // torpedo previews the whole row so the enemy's position stays hidden; the
  // empty-fleet bombCells call is used purely for its (clamped) geometry.
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
    (armed ? powerupTarget !== null && points >= POWERUP_COST : selected !== null);

  const handleFire = () => {
    if (armed && powerupTarget) {
      if (points < POWERUP_COST) {
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
  // Banner shows my last shot on the attack view, the opponent's on fleet.
  const bannerShot = isAttack ? lastShot : lastIncoming;

  // Cross-fade the two stacked boards instead of hard-swapping their opacity —
  // 1 = attack (enemy waters) on top, 0 = fleet on top.
  const attackFade = useSharedValue(isAttack ? 1 : 0);
  useEffect(() => {
    attackFade.value = withTiming(isAttack ? 1 : 0, { duration: BOARD_FADE_MS });
  }, [isAttack, attackFade]);
  const attackBoardStyle = useAnimatedStyle(() => ({ opacity: attackFade.value }));
  const fleetBoardStyle = useAnimatedStyle(() => ({
    opacity: 1 - attackFade.value,
  }));

  const handleHeaderBack = () => {
    Alert.alert(
      'Leave match?',
      'If you leave now you forfeit and lose the match.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: onExit },
      ],
    );
  };

  if (result) {
    const shotsFired = myShots.length;
    const hitsLanded = myShots.filter(s => s.result === 'hit').length;
    const accuracy = shotsFired ? Math.round((hitsLanded / shotsFired) * 100) : 0;
    const stats = [
      { value: `${shotsFired}`, label: 'SHOTS FIRED' },
      { value: `${hitsLanded}`, label: 'HITS LANDED', highlight: true },
      { value: `${accuracy}%`, label: 'ACCURACY' },
      { value: `${sunkByMe} / ${SHIPS.length}`, label: 'SHIPS SUNK', highlight: true },
    ];
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
            colors={[GLOW_COLOR, 'rgba(139, 92, 246, 0)']}
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
        {/* Players + turn timer */}
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

          {/* Both boards stay mounted and laid out; toggling cross-fades their
              opacity (not `display`, which tears down the Skia canvas surface
              and leaves it blank on the way back). They're stacked in a fixed
              square so only the active one takes visual/touch precedence. */}
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
                shots={opponentShots}
                action={opponentAction}
              />
            </Animated.View>
          </View>
        </View>

        {/* Last-shot result banner */}
        {bannerShot && (
          <View
            style={[
              styles.banner,
              bannerShot.result === 'hit' ? styles.bannerHit : styles.bannerMiss,
            ]}
          >
            <View
              style={[
                styles.bannerDot,
                {
                  backgroundColor:
                    bannerShot.result === 'hit'
                      ? colors.danger
                      : colors.textMuted,
                },
              ]}
            />
            <Text style={styles.bannerText}>
              {bannerShot.result === 'hit' ? 'DIRECT HIT' : 'MISS'} ·{' '}
              {cellLabel(bannerShot.row, bannerShot.col)}
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
  boardLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
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
