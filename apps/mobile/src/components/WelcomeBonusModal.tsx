import { ApiError, StakeAsset } from '@gaming-platform/core';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { apiClient } from '../api/client';
import { useStakePotStore } from '../store/stakePot.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';
import { DEFAULT_CHAIN_ID } from '../wallet/chains';
import { VIEM_CHAIN } from '../wallet/rpc';
import Icon from './Icon';
import { Button } from './ui';

type Step = 'offer' | 'confirmClose' | 'sent';

type Props = {
  visible: boolean;
  /** The claim tx was sent - persist so the offer never shows again. */
  onClaimed: () => void;
  /** Dismissed for good - the bonus is forfeited. */
  onDismissed: () => void;
  /** Fully done (or backgrounded after claiming). */
  onClose: () => void;
};

const BONUS_LABEL = '500';

/** Gold coin pile with a star, traced from the design comp. */
function CoinPile() {
  return (
    <Svg viewBox="0 0 120 78" width={184} height={120} fill="none">
      <Ellipse cx={60} cy={70} rx={40} ry={5} fill={colors.gold} opacity={0.1} />
      <Circle cx={22} cy={64} r={6} fill={colors.gold} opacity={0.85} />
      <Circle cx={22} cy={63} r={3.7} fill="#ffd977" opacity={0.5} />
      <Circle cx={98} cy={66} r={5} fill={colors.gold} opacity={0.8} />
      <Circle cx={98} cy={65} r={3.1} fill="#ffd977" opacity={0.5} />
      <Circle cx={40} cy={58} r={9} fill={colors.gold} />
      <Circle cx={40} cy={57} r={5.6} fill="#ffd977" opacity={0.5} />
      <Circle cx={60} cy={60} r={9.5} fill={colors.gold} />
      <Circle cx={60} cy={59} r={5.9} fill="#ffd977" opacity={0.5} />
      <Circle cx={80} cy={58} r={9} fill={colors.gold} />
      <Circle cx={80} cy={57} r={5.6} fill="#ffd977" opacity={0.5} />
      <Circle cx={50} cy={46} r={8.5} fill={colors.gold} />
      <Circle cx={50} cy={45} r={5.3} fill="#ffd977" opacity={0.5} />
      <Circle cx={70} cy={45} r={8.5} fill={colors.gold} />
      <Circle cx={70} cy={44} r={5.3} fill="#ffd977" opacity={0.5} />
      <Circle cx={60} cy={33} r={8} fill={colors.gold} />
      <Circle cx={60} cy={32} r={5} fill="#ffd977" opacity={0.5} />
      <Path
        d="M60 26 L62.4 31.6 L68 31.6 L63.4 35.2 L65.2 41 L60 37.4 L54.8 41 L56.6 35.2 L52 31.6 L57.6 31.6 Z"
        fill="#ffd977"
        opacity={0.9}
      />
    </Svg>
  );
}

export default function WelcomeBonusModal({
  visible,
  onClaimed,
  onDismissed,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>('offer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // The watcher credits the pot when the grant's Staked event lands, and the
  // balance socket push updates this store - that is the confirmation signal.
  const potKombat = useStakePotStore(
    s => s.balances.available[StakeAsset.Kombat],
  );
  const confirmed = txHash !== null && BigInt(potKombat) > 0n;

  const explorer = VIEM_CHAIN[DEFAULT_CHAIN_ID].blockExplorers?.default;

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.claimWelcomeBonus();
      setTxHash(result.txHash);
      onClaimed();
      setStep('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onClaimed(); // Nothing left to offer - never show this again.
      }
      setError(err instanceof Error ? err.message : 'The claim failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // After a failed claim there is nothing to forfeit, so closing needs no
  // "lose the free coins" detour.
  const requestClose = () => {
    if (error) {
      onClose();
      return;
    }
    setStep('confirmClose');
  };

  const shortHash = txHash ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.glow} />
        <View style={styles.card}>
          {step === 'offer' ? (
            <>
              <Pressable
                onPress={requestClose}
                hitSlop={spacing.xs}
                style={styles.closeBtn}
              >
                <Icon type="close" color={colors.textSecondary} size={14} />
              </Pressable>
              <CoinPile />
              <View style={styles.eyebrowRow}>
                <View style={styles.pulseDot} />
                <Text style={[type.label, styles.eyebrow]}>WELCOME BONUS</Text>
              </View>
              <Text style={styles.title}>Your first stake{'\n'}is on us</Text>
              <View style={styles.amountRow}>
                <Text style={styles.amount}>{BONUS_LABEL}</Text>
                <Text style={styles.amountSymbol}>KOMBAT</Text>
              </View>
              <Text style={styles.copy}>
                Claimed straight into your stake pot - enough for your first
                twenty staked matches.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                label={busy ? 'Claiming...' : `Claim ${BONUS_LABEL} KOMBAT`}
                icon="gem"
                variant="gold"
                disabled={busy}
                onPress={() => {
                  void claim();
                }}
                style={styles.claimBtn}
              />
              <Pressable onPress={requestClose} hitSlop={spacing.xs}>
                <Text style={styles.laterText}>
                  {error ? 'Close' : 'Maybe later'}
                </Text>
              </Pressable>
            </>
          ) : step === 'confirmClose' ? (
            <>
              <CoinPile />
              <Text style={styles.title}>Lose the free coins?</Text>
              <Text style={styles.copy}>
                Closing this forfeits the {BONUS_LABEL} KOMBAT welcome bonus.
                You will not be able to claim it later.
              </Text>
              <Button
                label="Keep my bonus"
                variant="gold"
                onPress={() => setStep('offer')}
                style={styles.claimBtn}
              />
              <Pressable
                onPress={() => {
                  onDismissed();
                  onClose();
                }}
                hitSlop={spacing.xs}
              >
                <Text style={styles.forfeitText}>Close and lose it</Text>
              </Pressable>
            </>
          ) : (
            <>
              <CoinPile />
              <View style={styles.eyebrowRow}>
                <View style={styles.pulseDot} />
                <Text style={[type.label, styles.eyebrow]}>WELCOME BONUS</Text>
              </View>
              <Text style={styles.title}>
                {confirmed
                  ? `${BONUS_LABEL} KOMBAT is in your pot`
                  : 'Your bonus is on the way'}
              </Text>
              {confirmed ? null : (
                <View style={styles.waitRow}>
                  <ActivityIndicator color={colors.gold} />
                  <Text style={styles.waitText}>
                    Waiting for on-chain confirmation
                  </Text>
                </View>
              )}
              {txHash && explorer ? (
                <Pressable
                  onPress={() => {
                    void Linking.openURL(`${explorer.url}/tx/${txHash}`);
                  }}
                  style={styles.txRow}
                >
                  <Text style={styles.txHash}>{shortHash}</Text>
                  <Text style={styles.txLink}>View on {explorer.name}</Text>
                </Pressable>
              ) : null}
              {confirmed ? (
                <Button
                  label="Start playing"
                  variant="gold"
                  onPress={onClose}
                  style={styles.claimBtn}
                />
              ) : (
                <Pressable onPress={onClose} hitSlop={spacing.xs}>
                  <Text style={styles.laterText}>Continue in the background</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 5, 9, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  glow: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    transform: [{ scale: 1.4 }],
    opacity: 0.6,
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  eyebrow: {
    color: colors.gold,
  },
  title: {
    fontFamily: display.semiBold,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
    marginTop: spacing.sm,
  },
  amount: {
    fontFamily: display.extraBold,
    fontSize: 44,
    letterSpacing: -1.5,
    color: colors.gold,
  },
  amountSymbol: {
    fontFamily: display.bold,
    fontSize: 14,
    color: colors.gold,
  },
  copy: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  error: {
    ...type.caption,
    color: colors.defeatRed,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  claimBtn: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  laterText: {
    fontFamily: display.bold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  forfeitText: {
    fontFamily: display.bold,
    fontSize: 13,
    color: colors.defeatRed,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  waitText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  txRow: {
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.md,
  },
  txHash: {
    fontFamily: mono.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  txLink: {
    fontFamily: display.bold,
    fontSize: 13,
    color: colors.gold,
  },
});
