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
import {
  CHROMA_SUITS,
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
  isPlayable,
  type ChromaSuit,
  type StakeAsset,
} from '@gaming-platform/core';

import Icon from '../../components/Icon';
import GameResultScreen from '../../components/GameResultScreen';
import { GradientView } from '../../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../../theme/colors';
import { display, fonts, mono } from '../../theme/typography';
import TurnTimer from '../battleship/game/TurnTimer';
import ChromaCardView, { ChromaCardBack } from './ChromaCardView';
import { SUIT_COLORS, SUIT_LABELS } from './chroma-theme';
import type { ChromaPlayProps } from './chroma-engine';

export type ChromaPlayScreenProps = ChromaPlayProps & {
  stake?: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
  onQuit: () => void;
};

const GLOW_COLOR = 'rgba(142, 224, 90, 0.28)';
const GLOW_TRANSPARENT = 'rgba(142, 224, 90, 0)';
const GLOW_HEIGHT = 380;

export default function ChromaPlayScreen({
  seats,
  myHand,
  myTurn,
  stage,
  activeSuit,
  discardTop,
  drawPileCount,
  direction,
  myDrawnIndex,
  pickingColor,
  notice,
  turnDeadline,
  result,
  resultReason,
  winnerName,
  onPlay,
  onDraw,
  onPass,
  onPickColor,
  onTimerExpire,
  stake,
  onExit,
  onQuit,
}: ChromaPlayScreenProps) {
  const { width } = useWindowDimensions();

  const [selected, setSelected] = useState<number | null>(null);
  const [soloArmed, setSoloArmed] = useState(false);
  const [prismSuit, setPrismSuit] = useState<ChromaSuit>('crimson');

  useEffect(() => {
    setSelected(null);
    setSoloArmed(false);
  }, [myTurn, stage, myHand.length]);

  const playableSet = useMemo(() => {
    const set = new Set<number>();
    myHand.forEach((card, i) => {
      if (isPlayable(card, activeSuit, discardTop.value)) {
        set.add(i);
      }
    });
    return set;
  }, [myHand, activeSuit, discardTop]);

  const me = seats.find(s => s.isMe);
  const opponents = seats.filter(s => !s.isMe);
  const turnSeat = seats.find(s => s.onTurn);

  if (result) {
    const stats = [
      { value: `${myHand.length}`, label: 'CARDS LEFT', highlight: result === 'win' },
      { value: `${seats.length}`, label: 'PLAYERS' },
    ];
    if (stake) {
      const symbol = STAKE_ASSET_SYMBOLS[stake.token];
      const amount = formatStakeAmount(stake.amount, stake.token);
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
            eyebrow: 'SOLO!',
            message:
              resultReason === 'complete'
                ? 'You shed every card first.'
                : 'Every rival is out. The pot is yours.',
          }
        : {
            eyebrow:
              resultReason === 'forfeit'
                ? 'MATCH FORFEITED'
                : resultReason === 'timeout'
                  ? 'LOST BY TIMEOUT'
                  : 'HAND NOT EMPTIED',
            message: winnerName
              ? `${winnerName} shed every card first.`
              : 'The match is over.',
          };
    return (
      <GameResultScreen
        variant={result}
        icon={result === 'win' ? 'trophy' : 'layers'}
        eyebrow={copy.eyebrow}
        title={result === 'win' ? 'YOU WIN' : 'DEFEAT'}
        message={copy.message}
        stats={stats}
        onBack={onQuit}
      />
    );
  }

  const drawEnabled = myTurn && stage === 'play' && myDrawnIndex === null;
  const selectable = (index: number) =>
    myTurn &&
    stage === 'play' &&
    playableSet.has(index) &&
    (myDrawnIndex === null || index === myDrawnIndex);
  const playDisabled = selected === null || !selectable(selected);
  const soloRelevant = myHand.length === 2;

  const handleCardTap = (index: number) => {
    if (!selectable(index)) {
      return;
    }
    setSelected(prev => (prev === index ? null : index));
  };

  const handlePlay = () => {
    if (selected === null || playDisabled) {
      return;
    }
    onPlay(selected, soloArmed);
    setSelected(null);
    setSoloArmed(false);
  };

  const fanned = myHand.length <= 8;
  const cardW = myHand.length > 6 ? 48 : 54;

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
          <Text style={styles.headerLabel}>FIRST TO EMPTY</Text>
          <Text style={styles.headerTitle}>Chroma Clash</Text>
        </View>
        <View style={styles.headerButton}>
          <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {opponents.map(seat => (
          <View
            key={seat.userId}
            style={[styles.oppRow, seat.onTurn && styles.oppRowActive]}
          >
            <View style={styles.oppAvatar}>
              <Text style={styles.oppAvatarText}>{seat.initial}</Text>
              <View
                style={[
                  styles.presenceDot,
                  { backgroundColor: seat.online ? colors.success : colors.danger },
                ]}
              />
            </View>
            <View style={styles.oppMeta}>
              <Text style={styles.oppName} numberOfLines={1}>
                {seat.name}
              </Text>
              <Text style={styles.oppSub}>
                {seat.eliminated
                  ? 'Eliminated'
                  : seat.onTurn
                    ? 'On turn'
                    : `${seat.cardCount} cards`}
              </Text>
            </View>
            {!seat.eliminated && (
              <View style={styles.oppCards}>
                {Array.from({ length: Math.min(seat.cardCount, 6) }, (_, i) => (
                  <View
                    key={i}
                    style={[styles.oppMiniCard, i > 0 && styles.oppMiniOverlap]}
                  />
                ))}
              </View>
            )}
            <Text style={styles.oppCount}>
              {seat.eliminated ? '-' : seat.cardCount}
            </Text>
          </View>
        ))}

        <View style={styles.table}>
          <Pressable
            style={[styles.pile, !drawEnabled && styles.pileDisabled]}
            disabled={!drawEnabled}
            onPress={onDraw}
          >
            <View style={styles.pileStack}>
              <View style={[styles.pileGhost, { top: 4, left: 4, opacity: 0.5 }]} />
              <View style={[styles.pileGhost, { top: 2, left: 2, opacity: 0.75 }]} />
              <ChromaCardBack width={62} />
            </View>
            <Text style={styles.pileLabel}>DRAW · {drawPileCount}</Text>
          </Pressable>

          <View style={styles.discard}>
            <ChromaCardView card={discardTop} width={68} />
            <View style={styles.activePill}>
              <View
                style={[
                  styles.activeDot,
                  {
                    backgroundColor: SUIT_COLORS[activeSuit],
                    shadowColor: SUIT_COLORS[activeSuit],
                  },
                ]}
              />
              <Text style={styles.activeLabel}>
                {SUIT_LABELS[activeSuit].toUpperCase()}
              </Text>
              <Icon
                type={direction === 1 ? 'arrow-right' : 'arrow-left'}
                color={colors.textMuted}
                size={12}
              />
            </View>
          </View>
        </View>

        <View style={styles.turnRow}>
          <View
            style={[
              styles.turnDot,
              { backgroundColor: myTurn ? colors.accent : colors.textFaint },
            ]}
          />
          <Text style={styles.turnText}>
            {myTurn
              ? myDrawnIndex !== null
                ? 'Play the drawn card or pass'
                : 'Your turn · match the colour or symbol'
              : `${turnSeat?.name ?? 'Opponent'}'s turn`}
          </Text>
          <TurnTimer deadline={turnDeadline} onExpire={onTimerExpire} style={styles.turnTimer} />
        </View>

        {notice && <Text style={styles.notice}>{notice}</Text>}

        <View style={styles.handHeader}>
          <Text style={styles.handLabel}>
            YOUR HAND · {myHand.length} CARDS
          </Text>
          <Text style={styles.handPlayable}>
            {myTurn ? `${[...playableSet].length} playable` : ''}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.handRow, fanned && styles.handRowFanned]}
          scrollEnabled={!fanned}
        >
          {myHand.map((card, i) => {
            const mid = (myHand.length - 1) / 2;
            const rot = fanned ? (i - mid) * 4 : 0;
            const lift = fanned ? Math.abs(i - mid) * 3 : 0;
            const isSelected = selected === i;
            return (
              <Pressable
                key={`${card.suit}-${card.value}-${i}`}
                onPress={() => handleCardTap(i)}
                style={[
                  fanned && {
                    transform: [
                      { rotate: `${rot}deg` },
                      { translateY: lift + (isSelected ? -14 : 0) },
                    ],
                    marginHorizontal: -5,
                  },
                  !fanned && isSelected && styles.flatSelected,
                ]}
              >
                <ChromaCardView
                  card={card}
                  width={cardW}
                  playable={selectable(i)}
                  selected={isSelected}
                  dimmed={myTurn && myDrawnIndex !== null && i !== myDrawnIndex}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      </ScrollView>

      <View style={styles.actions}>
        {myDrawnIndex !== null ? (
          <Pressable style={styles.soloButton} onPress={onPass}>
            <Text style={styles.soloText}>KEEP & PASS</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.soloButton,
              soloArmed && styles.soloButtonArmed,
              soloRelevant && !soloArmed && styles.soloButtonHint,
            ]}
            onPress={() => setSoloArmed(armed => !armed)}
          >
            <Text style={[styles.soloText, soloArmed && styles.soloTextArmed]}>
              SOLO!
            </Text>
          </Pressable>
        )}
        <Pressable
          style={styles.playWrap}
          disabled={playDisabled}
          onPress={handlePlay}
        >
          <GradientView
            colors={brandGradient.colors}
            positions={brandGradient.positions}
            style={[styles.playButton, playDisabled && styles.playButtonDisabled]}
          >
            <Text style={styles.playText}>PLAY</Text>
            <Icon type="chevron-right" color={colors.textPrimary} size={18} />
          </GradientView>
        </Pressable>
      </View>

      {/* In-screen overlay, never a second native Modal. */}
      {pickingColor && (
        <View style={styles.prismOverlay}>
          <View style={styles.prismSheet}>
            <View style={styles.dragHandle} />
            <View style={styles.prismCard}>
              <ChromaCardView card={discardTop} width={74} />
            </View>
            <Text style={styles.prismTitle}>Pick a colour</Text>
            <Text style={styles.prismSub}>
              Your Prism sets the colour everyone must match
            </Text>
            <View style={styles.prismGrid}>
              {CHROMA_SUITS.map(suit => {
                const on = prismSuit === suit;
                return (
                  <Pressable
                    key={suit}
                    onPress={() => setPrismSuit(suit)}
                    style={[
                      styles.prismChoice,
                      on && {
                        borderColor: SUIT_COLORS[suit],
                        backgroundColor: `${SUIT_COLORS[suit]}24`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.prismSwatch,
                        {
                          backgroundColor: SUIT_COLORS[suit],
                          shadowColor: SUIT_COLORS[suit],
                        },
                      ]}
                    />
                    <Text style={styles.prismChoiceLabel}>{SUIT_LABELS[suit]}</Text>
                    {on && (
                      <View
                        style={[
                          styles.prismCheck,
                          { backgroundColor: SUIT_COLORS[suit] },
                        ]}
                      >
                        <Icon type="check" color={colors.textPrimary} size={13} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => onPickColor(prismSuit)}>
              <GradientView
                colors={brandGradient.colors}
                positions={brandGradient.positions}
                style={styles.prismConfirm}
              >
                <Text style={styles.playText}>
                  CONFIRM {SUIT_LABELS[prismSuit].toUpperCase()}
                </Text>
              </GradientView>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
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
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.sm },

  oppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  oppRowActive: { borderColor: colors.accent },
  oppAvatar: {
    width: 36,
    height: 36,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oppAvatarText: { fontSize: 14, fontFamily: display.bold, color: colors.textPrimary },
  presenceDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.cardBackground,
  },
  oppMeta: { flex: 1, minWidth: 0 },
  oppName: { fontSize: 13, fontFamily: fonts.bold, color: colors.textPrimary },
  oppSub: { fontSize: 10, fontFamily: fonts.semiBold, color: colors.textMuted, marginTop: 1 },
  oppCards: { flexDirection: 'row' },
  oppMiniCard: {
    width: 15,
    height: 22,
    borderRadius: 3,
    backgroundColor: '#232532',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  oppMiniOverlap: { marginLeft: -6 },
  oppCount: { fontSize: 12, fontFamily: fonts.extraBold, color: colors.textSecondary, marginLeft: 6 },

  table: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
  },
  pile: { alignItems: 'center', gap: 9 },
  pileDisabled: { opacity: 0.65 },
  pileStack: { width: 68, height: 96 },
  pileGhost: {
    position: 'absolute',
    width: 62,
    height: 93,
    borderRadius: 9,
    backgroundColor: '#1B1D2B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pileLabel: { fontSize: 10, fontFamily: mono.bold, color: colors.textMuted, letterSpacing: 1 },
  discard: { alignItems: 'center', gap: 9 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  activeDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  activeLabel: { fontSize: 10, fontFamily: fonts.bold, letterSpacing: 0.6, color: colors.textPrimary },

  turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  turnDot: { width: 7, height: 7, borderRadius: 4 },
  turnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.textPrimary },
  turnTimer: { fontSize: 14, fontFamily: mono.bold, color: colors.accent, fontVariant: ['tabular-nums'] },
  notice: { fontSize: 11, fontFamily: fonts.semiBold, color: colors.textMuted, textAlign: 'center' },

  handHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  handLabel: { fontSize: 10, fontFamily: mono.medium, color: colors.textMuted, letterSpacing: 1.4 },
  handPlayable: { fontSize: 10, fontFamily: fonts.bold, color: colors.accent },
  handRow: { alignItems: 'flex-end', minHeight: 104, paddingHorizontal: 4, gap: 6 },
  handRowFanned: { flexGrow: 1, justifyContent: 'center' },
  flatSelected: { transform: [{ translateY: -10 }] },

  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  soloButton: {
    flex: 1,
    height: 52,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloButtonArmed: {
    backgroundColor: colors.accentSoft,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  soloButtonHint: { borderColor: colors.gold },
  soloText: { fontSize: 15, fontFamily: fonts.extraBold, letterSpacing: 1.2, color: colors.accent },
  soloTextArmed: { color: colors.textPrimary },
  playWrap: { flex: 1.3 },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 52,
    borderRadius: radius.card,
  },
  playButtonDisabled: { opacity: 0.4 },
  playText: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary, letterSpacing: 0.8 },

  prismOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 4, 10, 0.66)',
    justifyContent: 'flex-end',
  },
  prismSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: spacing.md,
  },
  prismCard: { alignItems: 'center', marginBottom: spacing.sm },
  prismTitle: {
    fontSize: 24,
    fontFamily: display.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  prismSub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  prismGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  prismChoice: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: spacing.sm,
  },
  prismSwatch: {
    width: 34,
    height: 34,
    borderRadius: 11,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  prismChoiceLabel: { fontSize: 15, fontFamily: fonts.bold, color: colors.textPrimary },
  prismCheck: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prismConfirm: {
    marginTop: spacing.lg,
    height: 54,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
