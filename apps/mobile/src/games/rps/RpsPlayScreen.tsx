import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import {
  BEST_OF,
  RPS_MOVES,
  STAKE_ASSET_SYMBOLS,
  WIN_TARGET,
  formatStakeAmount,
  type RpsMove,
  type StakeAsset,
} from '@gaming-platform/core';

import Icon from '../../components/Icon';
import GameResultScreen from '../../components/GameResultScreen';
import { GradientView } from '../../components/GradientView';
import {
  brandGradient,
  colors,
  radius,
  spacing,
  successGradient,
} from '../../theme/colors';
import { display, fonts, mono } from '../../theme/typography';
import TurnTimer from '../battleship/game/TurnTimer';
import RpsIcon from './RpsIcon';
import type { RpsPlayProps } from './rps-engine';

export type RpsPlayScreenProps = RpsPlayProps & {
  stake?: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
  onQuit: () => void;
};

const GLOW_COLOR = 'rgba(124, 92, 255, 0.28)';
const GLOW_TRANSPARENT = 'rgba(124, 92, 255, 0)';
const GLOW_HEIGHT = 380;

const MOVE_LABEL: Record<RpsMove, string> = {
  rock: 'ROCK',
  paper: 'PAPER',
  scissors: 'SCISSORS',
};

/** Row of BEST_OF/2-rounded score pips for one player. */
function ScorePips({ score }: { score: number }) {
  return (
    <View style={styles.pipRow}>
      {Array.from({ length: WIN_TARGET }, (_, i) => (
        <View key={i} style={[styles.pip, i < score && styles.pipOn]} />
      ))}
    </View>
  );
}

/**
 * Pure-UI Triple Cut screen: the live match (choose + lock) and the round
 * reveal, driven entirely by engine props. The demo bot engine and the
 * multiplayer socket engine both feed it.
 */
export default function RpsPlayScreen({
  opponent,
  myOnline,
  round,
  myScore,
  opponentScore,
  myMove,
  opponentLocked,
  stage,
  reveal,
  roundDeadline,
  result,
  resultReason,
  onLock,
  onNextRound,
  onTimerExpire,
  stake,
  onExit,
  onQuit,
}: RpsPlayScreenProps) {
  const { width } = useWindowDimensions();

  // A move is only committed by pressing LOCK IN - selecting a card just
  // arms it. Clear the local selection whenever a fresh round begins.
  const [selected, setSelected] = useState<RpsMove | null>(null);
  useEffect(() => {
    if (stage === 'choosing' && myMove === null) {
      setSelected(null);
    }
  }, [stage, round, myMove]);

  if (result) {
    const stats = [
      { value: `${myScore} - ${opponentScore}`, label: 'FINAL SCORE', highlight: true },
      { value: `Best of ${BEST_OF}`, label: 'FORMAT' },
    ];
    if (stake) {
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
    const copy =
      result === 'win'
        ? {
            eyebrow:
              resultReason === 'forfeit'
                ? 'OPPONENT FORFEITED'
                : resultReason === 'timeout'
                  ? 'VICTORY BY TIMEOUT'
                  : 'MATCH WON',
            message:
              resultReason === 'complete'
                ? `First to ${WIN_TARGET}. You read them like a book.`
                : `${opponent.name} is out. The win is yours.`,
          }
        : {
            eyebrow:
              resultReason === 'forfeit'
                ? 'MATCH FORFEITED'
                : resultReason === 'timeout'
                  ? 'LOST BY TIMEOUT'
                  : 'MATCH LOST',
            message:
              resultReason === 'timeout'
                ? 'You ran out of time once too often.'
                : `${opponent.name} took the series. Run it back.`,
          };
    return (
      <GameResultScreen
        variant={result}
        icon={result === 'win' ? 'trophy' : 'hand'}
        eyebrow={copy.eyebrow}
        title={result === 'win' ? 'VICTORY' : 'DEFEAT'}
        message={copy.message}
        opponent={{ initial: opponent.initial, label: result === 'win' ? 'DEFEATED' : 'LOST TO', name: opponent.name }}
        stats={stats}
        onBack={onQuit}
      />
    );
  }

  const revealing = stage === 'revealing' && reveal !== null;
  // The arena shows the committed move once locked, otherwise the armed pick.
  const activePick = myMove ?? selected;

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
            BEST OF {BEST_OF} · ROUND {round}
          </Text>
          <Text style={styles.headerTitle}>Triple Cut</Text>
        </View>
        <View style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </View>
      </View>

      <View style={styles.content}>
        {/* Score strip */}
        <View style={styles.scoreStrip}>
          <View style={styles.scoreSide}>
            <View style={[styles.avatar, styles.avatarEnemy]}>
              <Text style={styles.avatarText}>{opponent.initial}</Text>
              <View
                style={[
                  styles.presenceDot,
                  { backgroundColor: opponent.online ? colors.success : colors.danger },
                ]}
              />
            </View>
            <View style={styles.scoreMeta}>
              <Text style={styles.playerName} numberOfLines={1}>
                {opponent.name}
              </Text>
              <ScorePips score={opponentScore} />
            </View>
          </View>
          <Text style={styles.scoreNum}>{opponentScore}</Text>
          <Text style={styles.vsSmall}>VS</Text>
          <Text style={[styles.scoreNum, styles.scoreNumMe]}>{myScore}</Text>
          <View style={[styles.scoreSide, styles.scoreSideRight]}>
            <View style={[styles.scoreMeta, styles.scoreMetaRight]}>
              <Text style={styles.playerName}>You</Text>
              <ScorePips score={myScore} />
            </View>
            <View style={[styles.avatar, styles.avatarYou]}>
              <Text style={styles.avatarText}>Y</Text>
              <View
                style={[
                  styles.presenceDot,
                  { backgroundColor: myOnline ? colors.success : colors.danger },
                ]}
              />
            </View>
          </View>
        </View>

        {revealing ? (
          <RevealBody
            reveal={reveal!}
            opponent={opponent}
            myScore={myScore}
            opponentScore={opponentScore}
          />
        ) : (
          <>
            {/* Arena */}
            <View style={styles.arena}>
              <View style={styles.arenaSide}>
                <View style={styles.handSlot}>
                  <Text style={styles.qMark}>?</Text>
                </View>
                <View style={styles.lockBadge}>
                  <Icon
                    type={opponentLocked ? 'lock' : 'timer'}
                    color={colors.textMuted}
                    size={11}
                  />
                  <Text style={styles.lockBadgeText}>
                    {opponentLocked ? 'LOCKED IN' : 'CHOOSING'}
                  </Text>
                </View>
              </View>

              <View style={styles.arenaDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.vsBig}>VS</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.arenaSide}>
                <View style={[styles.handSlot, activePick && styles.handSlotPicked]}>
                  {activePick ? (
                    <RpsIcon move={activePick} size={52} color={colors.accent} />
                  ) : (
                    <Text style={styles.qMark}>·</Text>
                  )}
                </View>
                <View style={[styles.lockBadge, styles.lockBadgePick]}>
                  <Text style={styles.lockBadgePickText}>
                    {myMove ? 'LOCKED IN' : 'YOUR PICK'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Choose */}
            <Text style={styles.chooseLabel}>CHOOSE YOUR MOVE</Text>
            <View style={styles.choices}>
              {RPS_MOVES.map(move => {
                const on = activePick === move;
                const locked = myMove !== null;
                return (
                  <Pressable
                    key={move}
                    disabled={locked}
                    onPress={() => setSelected(move)}
                    style={[
                      styles.choiceCard,
                      on && styles.choiceCardOn,
                      locked && !on && styles.choiceCardDim,
                    ]}
                  >
                    <RpsIcon
                      move={move}
                      size={38}
                      color={on ? colors.accent : colors.textSecondary}
                    />
                    <Text style={[styles.choiceLabel, on && styles.choiceLabelOn]}>
                      {MOVE_LABEL[move]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Countdown + LOCK IN */}
            <View style={styles.footerRow}>
              <View style={styles.timerBox}>
                <TurnTimer
                  deadline={roundDeadline}
                  onExpire={onTimerExpire}
                  style={styles.timer}
                />
                <Text style={styles.timerLabel}>LEFT</Text>
              </View>
              <Pressable
                style={styles.lockWrap}
                disabled={myMove !== null || selected === null}
                onPress={() => selected && onLock(selected)}
              >
                <GradientView
                  colors={brandGradient.colors}
                  positions={brandGradient.positions}
                  style={[
                    styles.lockButton,
                    (myMove !== null || selected === null) && styles.lockButtonDisabled,
                  ]}
                >
                  <Icon
                    type={myMove ? 'check' : 'lock'}
                    color={colors.textPrimary}
                    size={18}
                  />
                  <Text style={styles.lockButtonText}>
                    {myMove ? 'LOCKED' : 'LOCK IN'}
                  </Text>
                </GradientView>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {revealing && (
        <View style={styles.nextBar}>
          <Pressable onPress={onNextRound}>
            <GradientView
              colors={successGradient.colors}
              positions={successGradient.positions}
              style={styles.nextButton}
            >
              <Text style={styles.nextText}>
                {reveal!.result === 'tie' ? 'REPLAY ROUND' : 'NEXT ROUND'}
              </Text>
              <Icon type="chevron-right" color={colors.background} size={18} />
            </GradientView>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

/** The reveal face per the design: eyebrow + headline, both hands with the
 *  winner flagged (loser dimmed), the score box, and the match-point line. */
function RevealBody({
  reveal,
  opponent,
  myScore,
  opponentScore,
}: {
  reveal: NonNullable<RpsPlayProps['reveal']>;
  opponent: { name: string };
  myScore: number;
  opponentScore: number;
}) {
  const eyebrow =
    reveal.result === 'win'
      ? 'ROUND WON'
      : reveal.result === 'loss'
        ? 'ROUND LOST'
        : 'TIE';
  const eyebrowColor =
    reveal.result === 'win'
      ? colors.success
      : reveal.result === 'loss'
        ? colors.danger
        : colors.textMuted;
  const decisive = reveal.result !== 'tie';
  const over = myScore >= WIN_TARGET || opponentScore >= WIN_TARGET;
  const matchPoint =
    !over && (myScore === WIN_TARGET - 1 || opponentScore === WIN_TARGET - 1);

  return (
    <View style={styles.reveal}>
      <Text style={[styles.revealEyebrow, { color: eyebrowColor }]}>{eyebrow}</Text>
      <Text style={styles.revealHeadline}>{reveal.headline}</Text>

      <View style={styles.revealHands}>
        <RevealHand
          move={reveal.opponentMove}
          name={opponent.name}
          won={reveal.result === 'loss'}
          dimmed={decisive && reveal.result === 'win'}
        />
        <Text style={styles.revealVs}>VS</Text>
        <RevealHand
          move={reveal.myMove}
          name="You"
          won={reveal.result === 'win'}
          dimmed={decisive && reveal.result === 'loss'}
        />
      </View>

      {/* Score box: opponent | pip stack | you (design's reveal footer). */}
      <View style={styles.revealScoreBox}>
        <View style={styles.revealScoreCol}>
          <Text style={styles.revealScoreLabel}>
            {opponent.name.toUpperCase()}
          </Text>
          <Text style={styles.revealScoreNum}>{opponentScore}</Text>
        </View>
        <View style={styles.revealPipStack}>
          {Array.from({ length: WIN_TARGET }, (_, i) => (
            <View
              key={i}
              style={[styles.revealPip, i < myScore && styles.revealPipOn]}
            />
          ))}
        </View>
        <View style={styles.revealScoreCol}>
          <Text style={[styles.revealScoreLabel, styles.revealScoreLabelMe]}>
            YOU
          </Text>
          <Text style={[styles.revealScoreNum, styles.revealScoreNumMe]}>
            {myScore}
          </Text>
        </View>
      </View>

      {matchPoint && (
        <Text style={styles.matchPoint}>Match point - one more to win</Text>
      )}
    </View>
  );
}

function RevealHand({
  move,
  name,
  won,
  dimmed,
}: {
  move: RpsMove | null;
  name: string;
  won: boolean;
  dimmed: boolean;
}) {
  return (
    <View style={styles.revealHandCol}>
      <View
        style={[
          styles.revealSlot,
          won && styles.revealSlotWon,
          dimmed && styles.revealSlotDim,
        ]}
      >
        {move ? (
          <RpsIcon move={move} size={58} color={won ? colors.success : colors.textSecondary} />
        ) : (
          <Text style={styles.qMark}>?</Text>
        )}
        {won && (
          <View style={styles.wonBadge}>
            <Icon type="check" color={colors.background} size={14} />
          </View>
        )}
      </View>
      <Text style={[styles.revealName, won && styles.revealNameWon]}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: GLOW_HEIGHT, pointerEvents: 'none' },
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
  headerCenter: { alignItems: 'center' },
  headerLabel: { fontSize: 10, fontFamily: mono.medium, color: colors.textMuted, letterSpacing: 1.5 },
  headerTitle: { fontSize: 17, fontFamily: display.bold, color: colors.textPrimary, marginTop: 1 },
  content: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },

  scoreStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  scoreSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  scoreSideRight: { justifyContent: 'flex-end' },
  scoreMeta: { minWidth: 0, gap: 5 },
  scoreMetaRight: { alignItems: 'flex-end' },
  avatar: { width: 38, height: 38, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  avatarYou: { backgroundColor: colors.brandStart },
  avatarEnemy: { backgroundColor: colors.surfaceMuted },
  avatarText: { fontSize: 15, fontFamily: display.bold, color: colors.textPrimary },
  presenceDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  playerName: { fontSize: 13, fontFamily: fonts.bold, color: colors.textPrimary },
  scoreNum: { fontSize: 24, fontFamily: mono.bold, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  scoreNumMe: { color: colors.textPrimary },
  vsSmall: { fontSize: 11, fontFamily: fonts.bold, color: colors.textFaint, letterSpacing: 1 },
  pipRow: { flexDirection: 'row', gap: 4 },
  pip: { width: 20, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  pipOn: { backgroundColor: colors.accent },

  arena: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  arenaSide: { alignItems: 'center', gap: 9 },
  handSlot: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handSlotPicked: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  qMark: { fontSize: 40, fontFamily: display.bold, color: colors.textFaint },
  arenaDivider: { alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  dividerLine: { width: 1, height: 22, backgroundColor: colors.cardBorder },
  vsBig: { fontSize: 13, fontFamily: fonts.extraBold, color: colors.accent, letterSpacing: 1 },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  lockBadgeText: { fontSize: 9, fontFamily: fonts.bold, letterSpacing: 0.8, color: colors.textMuted },
  lockBadgePick: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  lockBadgePickText: { fontSize: 9, fontFamily: fonts.extraBold, letterSpacing: 0.8, color: colors.accent },

  chooseLabel: { fontSize: 10, fontFamily: mono.medium, color: colors.textMuted, letterSpacing: 1.4 },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choiceCard: {
    flex: 1,
    alignItems: 'center',
    gap: 9,
    paddingVertical: 16,
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  choiceCardOn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1.5,
    // The design lifts the armed card slightly out of the row.
    transform: [{ translateY: -3 }],
  },
  choiceCardDim: { opacity: 0.4 },
  choiceLabel: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.4, color: colors.textMuted },
  choiceLabelOn: { color: colors.textPrimary },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 'auto', marginBottom: spacing.md },
  // Bare timer column beside the LOCK IN button, per the design.
  timerBox: { alignItems: 'center', gap: 2, minWidth: 56 },
  timer: { fontSize: 22, fontFamily: mono.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 9, fontFamily: mono.bold, color: colors.textMuted, letterSpacing: 1 },
  lockWrap: { flex: 1 },
  lockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 54,
    borderRadius: radius.button,
  },
  lockButtonDisabled: { opacity: 0.4 },
  lockButtonText: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, letterSpacing: 1 },

  // reveal
  reveal: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  revealEyebrow: { fontSize: 11, fontFamily: fonts.extraBold, letterSpacing: 2 },
  revealHeadline: { fontSize: 28, fontFamily: display.bold, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
  revealHands: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: spacing.md, marginTop: spacing.sm },
  revealHandCol: { alignItems: 'center', gap: 11 },
  revealSlot: {
    width: 104,
    height: 104,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealSlotWon: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
    borderWidth: 1.5,
  },
  revealSlotDim: { opacity: 0.72 },
  wonBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealVs: { fontSize: 15, fontFamily: fonts.extraBold, color: colors.textFaint, letterSpacing: 1 },
  revealName: { fontSize: 12, fontFamily: fonts.bold, color: colors.textMuted },
  revealNameWon: { color: colors.textPrimary },
  revealScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  revealScoreCol: { alignItems: 'center', gap: 2 },
  revealScoreLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    color: colors.textMuted,
  },
  revealScoreLabelMe: { color: colors.accentLight },
  revealScoreNum: {
    fontSize: 26,
    fontFamily: mono.bold,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  revealScoreNumMe: { color: colors.textPrimary },
  revealPipStack: { gap: 5 },
  revealPip: {
    width: 20,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  revealPipOn: { backgroundColor: colors.accent },
  matchPoint: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },

  nextBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 54,
    borderRadius: radius.button,
  },
  nextText: { fontSize: 16, fontFamily: fonts.bold, color: colors.textPrimary, letterSpacing: 1 },
});
