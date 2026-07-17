import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import {
  STAKE_ASSET_SYMBOLS,
  TOKENS_PER_PLAYER,
  formatStakeAmount,
  type StakeAsset,
} from '@gaming-platform/core';

import Icon from '../../components/Icon';
import GameResultScreen from '../../components/GameResultScreen';
import { GradientView } from '../../components/GradientView';
import { colors, radius, spacing } from '../../theme/colors';
import { display, fonts, mono } from '../../theme/typography';
import TurnTimer from '../battleship/game/TurnTimer';
import LudoBoard from './LudoBoard';
import LudoDice from './LudoDice';
import { LUDO_COLOR_HEX } from './ludo-theme';
import type { LudoPlayProps } from './ludo-engine';

export type LudoPlayScreenProps = LudoPlayProps & {
  /** Room code chip in the header (null in the demo). */
  roomCode: string | null;
  /** Per-player stake (staked matches) - shown on the result screen. */
  stake?: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
  onQuit: () => void;
};

const GLOW_COLOR = 'rgba(139, 92, 246, 0.25)';
const GLOW_TRANSPARENT = 'rgba(139, 92, 246, 0)';
const GLOW_HEIGHT = 420;
/** The design's board panel + ROLL button styling. */
const BOARD_PANEL_BG = '#0e0a1b';
const ROLL_GRADIENT = { colors: ['#8b5cf6', '#3b82f6'], positions: [0, 1] } as const;

/**
 * Pure-UI Ludo screen: renders entirely from engine props and reports
 * intents (roll / pick a token) via callbacks - the demo bot engine and the
 * multiplayer socket engine both feed it.
 */
export default function LudoPlayScreen({
  seats,
  tokens,
  eliminatedColors,
  myColor,
  turnColor,
  myTurn,
  stage,
  die,
  rollId,
  movableTokens,
  notice,
  turnDeadline,
  result,
  resultReason,
  winnerName,
  myCaptures,
  onRoll,
  onMoveToken,
  onTimerExpire,
  roomCode,
  stake,
  onExit,
  onQuit,
}: LudoPlayScreenProps) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - spacing.md * 2 - 18, 356);

  // Every roll (anyone's) shakes the die and shuffles its face briefly
  // before it settles on the real value.
  const [rolling, setRolling] = useState(false);
  const prevRollId = useRef(rollId);
  useEffect(() => {
    if (rollId === prevRollId.current) {
      return;
    }
    prevRollId.current = rollId;
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), 550);
    return () => clearTimeout(timer);
  }, [rollId]);

  if (result) {
    const me = seats.find(s => s.isMe);
    const stats = [
      { value: `${me?.homeCount ?? 0} / ${TOKENS_PER_PLAYER}`, label: 'PAWNS HOME', highlight: true },
      { value: `${myCaptures}`, label: 'CAPTURES' },
      { value: `${seats.length}`, label: 'PLAYERS' },
    ];
    if (stake) {
      const symbol = STAKE_ASSET_SYMBOLS[stake.token];
      const amount = formatStakeAmount(stake.amount, stake.token);
      // Pot (stake x seats) rather than net winnings - the fee lands on-chain
      // at settlement, so the exact net shows in History once settled.
      const pot = formatStakeAmount(
        (BigInt(stake.amount) * BigInt(seats.length)).toString(),
        stake.token,
      );
      stats.push(
        result === 'win'
          ? { value: `${pot} ${symbol}`, label: 'POT WON', highlight: true }
          : { value: `${amount} ${symbol}`, label: 'STAKE LOST' },
      );
    }
    const copy =
      result === 'win'
        ? {
            eyebrow:
              resultReason === 'complete' ? 'ALL PAWNS HOME' : 'LAST PLAYER STANDING',
            title: 'VICTORY',
            message:
              resultReason === 'complete'
                ? 'You raced every pawn home first. The table is yours.'
                : 'Everyone else dropped out. The table is yours.',
          }
        : {
            eyebrow:
              resultReason === 'timeout'
                ? 'OUT OF TIME'
                : resultReason === 'forfeit'
                  ? 'MATCH FORFEITED'
                  : 'RACE LOST',
            title: 'DEFEAT',
            message:
              resultReason === 'timeout'
                ? 'You ran out of time once too often and were eliminated.'
                : resultReason === 'forfeit'
                  ? 'You left the match and were eliminated.'
                  : `${winnerName ?? 'Another player'} brought every pawn home first.`,
          };
    return (
      <GameResultScreen
        variant={result}
        icon={result === 'win' ? 'trophy' : 'dice'}
        eyebrow={copy.eyebrow}
        title={copy.title}
        message={copy.message}
        stats={stats}
        onBack={onQuit}
      />
    );
  }

  const turnSeat = seats.find(s => s.color === turnColor) ?? null;
  const hint = notice
    ? notice
    : myTurn
      ? stage === 'roll'
        ? 'Roll a 6 to release a pawn, or move one already out.'
        : `Tap a glowing pawn to move ${die ?? ''}.`
      : turnSeat
        ? `${turnSeat.name} is playing...`
        : '';

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
          <Text style={styles.headerLabel}>
            {roomCode ? `ROOM #${roomCode} · CLASSIC` : 'DEMO · CLASSIC'}
          </Text>
          <Text style={styles.headerTitle}>Ludo Royale</Text>
        </View>
        <Pressable style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Player HUD */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hudRow}
        >
          {seats.map(seat => {
            const active = seat.color === turnColor;
            return (
              <View
                key={seat.color}
                style={[
                  styles.hudCard,
                  active && styles.hudCardActive,
                  seat.eliminated && styles.hudCardEliminated,
                ]}
              >
                <View
                  style={[styles.hudAvatar, { backgroundColor: LUDO_COLOR_HEX[seat.color] }]}
                >
                  <Text style={styles.hudInitial}>{seat.initial}</Text>
                  {!seat.eliminated && (
                    <View
                      style={[
                        styles.presenceDot,
                        {
                          backgroundColor: seat.online
                            ? colors.success
                            : colors.danger,
                        },
                      ]}
                    />
                  )}
                </View>
                <View>
                  <Text style={styles.hudName} numberOfLines={1}>
                    {seat.name}
                  </Text>
                  <Text style={styles.hudSub}>
                    {seat.eliminated
                      ? 'Out'
                      : `${seat.homeCount}/${TOKENS_PER_PLAYER} home`}
                  </Text>
                </View>
                {active && (
                  <View style={styles.turnPill}>
                    <Text style={styles.turnPillText}>TURN</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Board */}
        <View style={[styles.boardPanel, { width: boardSize + 18 }]}>
          <LudoBoard
            boardSize={boardSize}
            seatedColors={seats.map(s => s.color)}
            tokens={tokens}
            eliminated={eliminatedColors}
            myColor={myColor}
            movableTokens={myTurn && stage === 'move' ? movableTokens : []}
            onTokenTap={tokenIndex => {
              if (myTurn && stage === 'move' && movableTokens.includes(tokenIndex)) {
                onMoveToken(tokenIndex);
              }
            }}
          />
        </View>

        {/* Turn card + die */}
        <View style={styles.turnRow}>
          <View
            style={[
              styles.turnCard,
              turnColor && { borderColor: `${LUDO_COLOR_HEX[turnColor]}55` },
            ]}
          >
            <View style={styles.turnTitleRow}>
              {turnColor && (
                <View
                  style={[styles.turnDot, { backgroundColor: LUDO_COLOR_HEX[turnColor] }]}
                />
              )}
              <Text style={styles.turnTitle}>
                {myTurn ? 'Your turn' : turnSeat ? `${turnSeat.name}'s turn` : ''}
              </Text>
              <TurnTimer
                deadline={turnDeadline}
                onExpire={onTimerExpire}
                style={styles.turnTimer}
              />
            </View>
            <Text style={styles.turnHint} numberOfLines={2}>
              {hint}
            </Text>
          </View>
          <LudoDice value={die} rolling={rolling} />
        </View>
      </ScrollView>

      {/* Roll */}
      <View style={styles.rollBar}>
        <Pressable disabled={!myTurn || stage !== 'roll'} onPress={onRoll}>
          <GradientView
            colors={ROLL_GRADIENT.colors}
            positions={ROLL_GRADIENT.positions}
            style={[
              styles.rollButton,
              (!myTurn || stage !== 'roll') && styles.rollButtonDisabled,
            ]}
          >
            <Icon type="dice" color={colors.textPrimary} size={22} />
            <Text style={styles.rollText}>
              {myTurn && stage === 'move' ? 'MOVE A PAWN' : 'ROLL DICE'}
            </Text>
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
    alignItems: 'center',
  },
  hudRow: {
    gap: 8,
    paddingBottom: spacing.sm,
  },
  hudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
  },
  hudCardActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  hudCardEliminated: {
    opacity: 0.45,
  },
  hudAvatar: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudInitial: {
    fontSize: 12,
    fontFamily: display.bold,
    color: 'rgba(0, 0, 0, 0.55)',
  },
  presenceDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.background,
  },
  hudName: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  hudSub: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },
  turnPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  turnPillText: {
    fontSize: 9,
    fontFamily: fonts.extraBold,
    letterSpacing: 1,
    color: '#c4b5fd',
  },
  boardPanel: {
    backgroundColor: BOARD_PANEL_BG,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 9,
  },
  turnRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  turnCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    gap: 5,
  },
  turnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  turnDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  turnTitle: {
    fontSize: 14,
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  turnTimer: {
    marginLeft: 'auto',
    fontSize: 13,
    fontFamily: mono.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  turnHint: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
  },
  rollBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  rollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 54,
    borderRadius: radius.button,
  },
  rollButtonDisabled: {
    opacity: 0.4,
  },
  rollText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
});
