import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { ApiError } from '@gaming-platform/core';

import Icon from '../components/Icon';
import { Button, Card, Chip } from '../components/ui';
import { useCurrentUserStore } from '../store/currentUser.store';
import { getWalletSecret } from '../wallet/wallet-keychain';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

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

  const isValid = USERNAME_PATTERN.test(username.trim());
  const canSubmit = isValid && !busy;

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
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Step indicator */}
          <View style={styles.stepRow}>
            <Text style={styles.stepText}>STEP 01 / 02</Text>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
              <View style={styles.progressRest} />
            </View>
          </View>

          <Text style={styles.title}>Set up your account</Text>
          <Text style={styles.subtitle}>
            Choose a username and secure your recovery phrase before you play.
          </Text>

          {/* Username */}
          <View style={styles.section}>
            <Text style={[type.label, styles.label]}>Username</Text>
            <View style={[styles.input, isValid && styles.inputValid]}>
              <TextInput
                style={styles.inputText}
                value={username}
                onChangeText={setUsername}
                placeholder="Katty_Kombat"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                editable={!busy}
              />
              {isValid ? (
                <Icon type="check" color={colors.accent} size={20} />
              ) : null}
            </View>
            <Text style={styles.hint}>
              3–20 characters · letters, numbers, underscores.
            </Text>
            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}
          </View>

          {/* Recovery phrase */}
          <View style={styles.section}>
            <View style={styles.recoveryHeaderRow}>
              <Text style={[type.label, styles.label]}>Recovery phrase</Text>
              <Chip label="Keep secret" tone="gold" />
            </View>

            <Card>
              <View style={styles.wordGridWrapper}>
                <View style={styles.wordGrid}>
                  {(revealed && mnemonicWords ? mnemonicWords : MASK_LENGTHS).map(
                    (word, index) => (
                      <View key={index} style={styles.wordChip}>
                        <Text style={styles.wordChipText} numberOfLines={1}>
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
                    <View style={styles.lockCircle}>
                      <Icon type="lock" color={colors.accent} size={22} />
                    </View>
                  </View>
                ) : null}
              </View>

              <View style={styles.recoveryActions}>
                <Button
                  label={revealed ? 'Hide' : 'Reveal'}
                  icon={revealed ? 'eye-off' : 'eye'}
                  variant="tinted"
                  size="md"
                  onPress={handleReveal}
                  style={styles.actionFlex}
                />
                <Button
                  label={copied ? 'Copied!' : 'Copy'}
                  icon="copy"
                  variant="secondary"
                  size="md"
                  onPress={handleCopy}
                  style={styles.actionFlex}
                />
              </View>
            </Card>

            {mnemonicError ? (
              <Text style={styles.error}>{mnemonicError}</Text>
            ) : null}

            <View style={styles.warningBox}>
              <Icon type="warning" color={colors.gold} size={18} />
              <Text style={styles.warningText}>
                Never share this phrase. Anyone with it controls your wallet.
              </Text>
            </View>
          </View>

          <Button
            label={busy ? 'Saving…' : 'Continue'}
            trailingIcon="arrow-right"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={busy}
          />
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepText: {
    fontFamily: mono.semiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.accent,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 4,
    width: 64,
  },
  progressFill: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  progressRest: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    marginBottom: spacing.xxs,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
  },
  inputValid: {
    borderColor: colors.accentBorder,
  },
  inputText: {
    flex: 1,
    fontFamily: mono.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  hint: {
    ...type.caption,
    color: colors.textFaint,
  },
  recoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordGridWrapper: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  wordChip: {
    minWidth: 84,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  wordChipText: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textSecondary,
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
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  recoveryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: {
    flex: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  warningText: {
    flex: 1,
    ...type.caption,
    color: colors.gold,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
});
