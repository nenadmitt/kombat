import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { ApiError } from '@gaming-platform/core';

import { GradientView } from '../components/GradientView';
import { useCurrentUserStore } from '../store/currentUser.store';
import { getWalletSecret } from '../wallet/wallet-keychain';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
// Placeholder word lengths for the masked grid before the real mnemonic is loaded.
const MASK_LENGTHS = [6, 7, 5, 8, 5, 6, 5, 7, 8];

export default function OnboardingScreen() {
  const updateUsername = useCurrentUserStore(state => state.updateUsername);

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [mnemonicWords, setMnemonicWords] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = USERNAME_PATTERN.test(username.trim()) && !busy;

  const handleSubmit = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      await updateUsername(username.trim());
      // No manual navigation — RootNavigator reacts to `username` becoming non-null.
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    setMnemonicError(null);
    if (revealed) {
      setRevealed(false);
      return;
    }
    try {
      const secret = await getWalletSecret();
      if (!secret) {
        setMnemonicError('No wallet secret found on this device');
        return;
      }
      setMnemonicWords(secret.mnemonic.split(' '));
      setRevealed(true);
    } catch {
      setMnemonicError('Failed to read wallet secret');
    }
  };

  const handleCopy = async () => {
    setMnemonicError(null);
    try {
      const secret = await getWalletSecret();
      if (!secret) {
        setMnemonicError('No wallet secret found on this device');
        return;
      }
      Clipboard.setString(secret.mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMnemonicError('Failed to read wallet secret');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {/* Progress indicator (decorative — this is the only onboarding step) */}
          <View style={styles.progressRow}>
            <View style={styles.progressDot} />
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.progressDotActive}
            />
            <View style={styles.progressDot} />
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.title}>Almost Legendary</Text>
            <Text style={styles.subtitle}>
              Choose a username and secure your wallet recovery phrase before
              you start playing.
            </Text>
          </View>

          {/* Username */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.labelIcon}>👤</Text>
              <Text style={styles.label}>USERNAME</Text>
            </View>
            <View style={styles.input}>
              <TextInput
                style={styles.inputText}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter your username..."
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                editable={!busy}
              />
              <View style={styles.atBadge}>
                <Text style={styles.atBadgeText}>@</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              3-20 characters, letters, numbers and underscores only.
            </Text>
            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}
          </View>

          {/* Recovery phrase */}
          <View style={styles.section}>
            <View style={styles.recoveryHeaderRow}>
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>🔑</Text>
                <Text style={styles.label}>RECOVERY PHRASE</Text>
              </View>
              <View style={styles.keepSecretBadge}>
                <Text style={styles.keepSecretText}>Keep Secret</Text>
              </View>
            </View>

            <View style={styles.recoveryCard}>
              <View style={styles.wordGridWrapper}>
                <View style={styles.wordGrid}>
                  {(revealed && mnemonicWords ? mnemonicWords : MASK_LENGTHS).map(
                    (word, index) => (
                      <View key={index} style={styles.wordChip}>
                        <Text style={styles.wordChipText}>
                          {revealed && mnemonicWords
                            ? (word as string)
                            : '•'.repeat(word as number)}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
                {!revealed ? (
                  <View style={styles.lockOverlay}>
                    <Text style={styles.lockIcon}>🔒</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.recoveryActions}>
                <Pressable onPress={handleReveal} style={styles.revealButton}>
                  <Text style={styles.revealIcon}>👁</Text>
                  <Text style={styles.revealText}>
                    {revealed ? 'Hide' : 'Reveal'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleCopy} style={styles.copyButton}>
                  <Text style={styles.copyIcon}>⧉</Text>
                  <Text style={styles.copyText}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {mnemonicError ? (
              <Text style={styles.error}>{mnemonicError}</Text>
            ) : null}

            <View style={styles.warningBox}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.warningText}>
                Never share your recovery phrase. Anyone with it has full
                access to your wallet.
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.continueWrapper,
              (pressed || !canSubmit) && styles.continueDimmed,
            ]}
          >
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueButton}
            >
              <Text style={styles.continueText}>
                {busy ? 'Saving…' : 'Continue'}
              </Text>
              <Text style={styles.continueArrow}>→</Text>
            </GradientView>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  progressDot: {
    width: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#475569',
  },
  progressDotActive: {
    width: 32,
    height: 6,
    borderRadius: 3,
  },
  titleBlock: {
    gap: spacing.xs + 6,
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.xs + 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs - 2,
  },
  labelIcon: {
    fontSize: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card - 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm - 2,
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  atBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  atBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandStart,
  },
  hint: {
    fontSize: 12,
    color: colors.textFaint,
  },
  recoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  keepSecretBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 4,
    paddingVertical: 4,
  },
  keepSecretText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.kombatAccent,
  },
  recoveryCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card + 4,
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  wordGridWrapper: {
    borderRadius: radius.card - 4,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 4,
    justifyContent: 'center',
  },
  wordChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: spacing.xs + 6,
    paddingVertical: spacing.xs - 2,
  },
  wordChipText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'Menlo',
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 22,
    backgroundColor: 'rgba(11, 11, 14, 0.8)',
    width: 48,
    height: 48,
    borderRadius: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  recoveryActions: {
    flexDirection: 'row',
    gap: spacing.sm - 4,
  },
  revealButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 14,
    paddingVertical: spacing.sm - 2,
  },
  revealIcon: {
    fontSize: 14,
  },
  revealText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a78bfa',
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingVertical: spacing.sm - 2,
  },
  copyIcon: {
    fontSize: 14,
    color: colors.textMuted,
  },
  copyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 4,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 12,
    padding: spacing.sm - 2,
  },
  warningIcon: {
    fontSize: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(245, 158, 11, 0.8)',
  },
  error: {
    fontSize: 13,
    color: '#f87171',
  },
  continueWrapper: {
    borderRadius: radius.hero - 12,
  },
  continueDimmed: {
    opacity: 0.6,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 58,
    borderRadius: radius.hero - 12,
  },
  continueText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  continueArrow: {
    fontSize: 18,
    color: colors.textPrimary,
  },
});
