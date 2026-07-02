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
import { ApiError } from '@gaming-platform/core';

import { GradientView } from '../components/GradientView';
import { useCurrentUserStore } from '../store/currentUser.store';
import { getWalletSecret } from '../wallet/wallet-keychain';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export default function OnboardingScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);
  const updateUsername = useCurrentUserStore(state => state.updateUsername);

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);

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

  const handleRevealMnemonic = async () => {
    setMnemonicError(null);
    try {
      const secret = await getWalletSecret();
      if (!secret) {
        setMnemonicError('No wallet secret found on this device');
        return;
      }
      setMnemonic(secret.mnemonic);
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
          <View style={styles.logoStack}>
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={styles.logoIcon}
            >
              <Text style={styles.logoGem}>💎</Text>
            </GradientView>
            <Text style={styles.title}>Welcome!</Text>
            <Text style={styles.subtitle}>Let's set up your account.</Text>
          </View>

          {/* Username */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose a username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={!busy}
            />
            <Text style={styles.hint}>
              3-20 characters — letters, numbers, underscore.
            </Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.buttonWrapper,
                (pressed || !canSubmit) && styles.buttonDimmed,
              ]}
            >
              <GradientView
                colors={brandGradient.colors}
                positions={brandGradient.positions}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>
                  {busy ? 'Saving…' : 'Save username'}
                </Text>
              </GradientView>
            </Pressable>
            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}
          </View>

          {/* Wallet */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your wallet is ready</Text>
            {wallet ? (
              <View style={styles.walletCard}>
                <Text style={styles.walletAddress}>{wallet.address}</Text>
              </View>
            ) : null}

            {mnemonic ? (
              <View style={styles.mnemonicCard}>
                <Text style={styles.mnemonicWarning}>
                  Write this down and keep it safe. Anyone with this phrase
                  can access your funds.
                </Text>
                <Text style={styles.mnemonicText}>{mnemonic}</Text>
              </View>
            ) : (
              <Pressable onPress={handleRevealMnemonic} style={styles.backupRow}>
                <Text style={styles.backupLabel}>Backup your wallet</Text>
                <Text style={styles.backupChevron}>›</Text>
              </Pressable>
            )}
            {mnemonicError ? (
              <Text style={styles.error}>{mnemonicError}</Text>
            ) : null}
          </View>
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
    gap: spacing.xl,
  },
  logoStack: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.logo,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  logoGem: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  input: {
    height: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  buttonWrapper: {
    borderRadius: radius.button,
    marginTop: spacing.xs,
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  button: {
    height: 52,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  error: {
    fontSize: 13,
    color: '#f87171',
  },
  walletCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  walletAddress: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: 'Menlo',
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
  },
  backupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  backupChevron: {
    fontSize: 18,
    color: colors.textMuted,
  },
  mnemonicCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.kombatAccent,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
    gap: spacing.xs,
  },
  mnemonicWarning: {
    fontSize: 12,
    color: colors.kombatAccent,
  },
  mnemonicText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    fontFamily: 'Menlo',
  },
});
