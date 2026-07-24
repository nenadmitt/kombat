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

import Icon from '../components/Icon';
import { Button, Card, Chip } from '../components/ui';
import { useCurrentUserStore } from '../store/currentUser.store';
import { getWalletSecret } from '../wallet/wallet-keychain';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
// Placeholder word lengths for the masked grid before the real mnemonic is loaded.
const MASK_LENGTHS = [6, 7, 5, 8, 5, 6, 5, 7, 8];
// Selectable avatar tints (a local preview - persistence isn't wired yet).
const AVATAR_COLORS = [colors.accent, colors.gold, colors.success, colors.info];

export default function OnboardingScreen() {
  const updateUsername = useCurrentUserStore(state => state.updateUsername);

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [mnemonicWords, setMnemonicWords] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Visual-only avatar tint (no backend support yet - a design preview).
  const [avatarColor, setAvatarColor] = useState<string>(colors.accent);

  const isValid = USERNAME_PATTERN.test(username.trim());
  const avatarInitial = (username.trim()[0] ?? 'K').toUpperCase();
  const canSubmit = isValid && !busy;

  const handleSubmit = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      await updateUsername(username.trim());
      // No manual navigation - RootNavigator reacts to `username` becoming non-null.
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
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Set up your account</Text>
            <Text style={styles.subtitle}>
              Pick a username and avatar, then back up your recovery phrase.
            </Text>
          </View>

          {/* Profile: avatar + tint picker + username */}
          <Card accent style={styles.profileCard}>
            <Text style={[type.label, styles.profileLabel]}>Your profile</Text>

            <View style={styles.avatarRow}>
              <View style={[styles.avatarTile, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarInitial}>{avatarInitial}</Text>
              </View>
              <View style={styles.swatches}>
                {AVATAR_COLORS.map(swatch => (
                  <Pressable
                    key={swatch}
                    onPress={() => setAvatarColor(swatch)}
                    accessibilityRole="button"
                    accessibilityLabel={`Avatar colour ${swatch}`}
                    style={[
                      styles.swatchRing,
                      avatarColor === swatch && styles.swatchRingActive,
                    ]}
                  >
                    <View style={[styles.swatch, { backgroundColor: swatch }]} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.usernameBlock}>
              <View style={[styles.usernameField, isValid && styles.usernameFieldValid]}>
                <TextInput
                  style={styles.usernameInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Katty_Kombat"
                  placeholderTextColor={colors.textFaint}
                  selectionColor={colors.accent}
                  cursorColor={colors.accent}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  editable={!busy}
                />
                {isValid ? (
                  <View style={styles.availableBadge}>
                    <Icon type="check-circle" color={colors.success} size={13} />
                    <Text style={styles.availableText}>AVAILABLE</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.hint}>
                3-20 characters · letters, numbers, underscores.
              </Text>
              {errorMessage ? (
                <Text style={styles.error}>{errorMessage}</Text>
              ) : null}
            </View>
          </Card>

          {/* Recovery phrase */}
          <View style={styles.recoveryHeaderRow}>
            <Text style={[type.label, styles.label]}>Recovery phrase</Text>
            <Chip label="Keep secret" tone="gold" icon="lock" />
          </View>

          <Card>
            <View style={styles.gridContainer}>
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
    // One uniform vertical rhythm between every block on the screen.
    gap: spacing.md,
  },
  titleGroup: {
    gap: spacing.xs,
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
  label: {
    color: colors.textMuted,
  },
  profileCard: {
    gap: spacing.md,
  },
  profileLabel: {
    color: colors.accentLight,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarTile: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: display.bold,
    fontSize: 25,
    color: colors.onAccent,
  },
  swatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatchRing: {
    padding: 2,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchRingActive: {
    borderColor: colors.accent200,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 10,
  },
  usernameBlock: {
    gap: spacing.xs,
  },
  usernameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  usernameFieldValid: {
    borderColor: colors.accent,
  },
  usernameInput: {
    flex: 1,
    // Sora reads airy at input size; tighten the tracking to match the design.
    fontFamily: display.bold,
    fontSize: 17,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    // Trim RN's default vertical text padding so the caret sits snug.
    paddingVertical: 0,
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  availableText: {
    fontFamily: mono.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.success,
  },
  hint: {
    ...type.caption,
    color: colors.textPrimary,
  },
  recoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  wordGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  wordChip: {
    // Three equal columns that fill the card width (RN has no CSS grid).
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
    borderColor: 'rgba(245, 184, 41, 0.28)',
    borderRadius: radius.md,
    padding: spacing.md,
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
