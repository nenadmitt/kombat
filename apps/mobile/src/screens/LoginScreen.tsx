import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Chip } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type SheetStep = 'methods' | 'email' | 'code';

const FEATURES = ['Self-custody', 'Provably fair', 'Instant payouts'];

export default function LoginScreen(_props: Props) {
  const loginWithToken = useCurrentUserStore(state => state.loginWithToken);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [step, setStep] = useState<SheetStep>('methods');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openSheet = () => {
    setStep('methods');
    setEmail('');
    setCode('');
    setErrorMessage(null);
    setSheetVisible(true);
  };

  const closeSheet = () => setSheetVisible(false);

  const handleSendCode = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      await apiClient.requestLoginToken(email.trim());
      setStep('code');
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const { accessToken } = await apiClient.exchangeLoginToken(
        email.trim(),
        code.trim(),
      );
      await loginWithToken(accessToken);
      setSheetVisible(false);
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const canSendCode = /\S+@\S+\.\S+/.test(email.trim()) && !busy;
  const canVerify = code.trim().length === 8 && !busy;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {/* Logo + wordmark */}
        <View style={styles.logoStack}>
          <View style={styles.logoTile}>
            <Icon type="gem" color={colors.onAccent} size={34} />
          </View>
          <Text style={styles.wordmark}>KOMBAT</Text>
        </View>

        {/* Hero visual */}
        <View style={styles.hero}>
          <View style={styles.heroGlow}>
            <Icon type="swords" color={colors.accent} size={72} />
          </View>
          <Text style={styles.heroCaption}>NEON ARCADE · WIN CRYPTO</Text>
        </View>

        {/* Headline + CTA */}
        <View style={styles.footer}>
          <Text style={styles.headline}>
            Play.{'\n'}Compete.{'\n'}
            <Text style={styles.headlineAccent}>Win</Text>
          </Text>

          <Button label="Start Winning" onPress={openSheet} />

          <Text style={styles.disclaimer}>
            A self-custodial wallet is created for you automatically.
          </Text>

          <View style={styles.features}>
            {FEATURES.map(f => (
              <Chip key={f} label={f} tone="outline" />
            ))}
          </View>
        </View>
      </View>

      <Modal
        visible={sheetVisible}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <KeyboardAvoidingView
          style={styles.sheetWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHandle} />
            {step === 'methods' && (
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>Sign in</Text>

                <Button
                  label="Continue with Email"
                  icon="at-sign"
                  variant="secondary"
                  onPress={() => setStep('email')}
                />

                <View style={styles.methodDisabled}>
                  <Text style={styles.methodLabelDisabled}>
                    Continue with Google
                  </Text>
                  <Chip label="Soon" tone="neutral" />
                </View>
              </View>
            )}

            {step === 'email' && (
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>Enter your email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!busy}
                  autoFocus
                />
                <Button
                  label={busy ? 'Sending code…' : 'Send code'}
                  onPress={handleSendCode}
                  disabled={!canSendCode}
                  loading={busy}
                  trailingIcon="arrow-right"
                />
                {errorMessage ? (
                  <Text style={styles.error}>{errorMessage}</Text>
                ) : null}
              </View>
            )}

            {step === 'code' && (
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>
                  Enter the code sent to {email.trim()}
                </Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="ABCD1234"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  maxLength={8}
                  editable={!busy}
                  autoFocus
                />
                <Button
                  label={busy ? 'Verifying…' : 'Verify'}
                  onPress={handleVerify}
                  disabled={!canVerify}
                  loading={busy}
                  trailingIcon="arrow-right"
                />
                <Button
                  label="Use a different email"
                  variant="ghost"
                  size="md"
                  onPress={() => setStep('email')}
                  disabled={busy}
                />
                {errorMessage ? (
                  <Text style={styles.error}>{errorMessage}</Text>
                ) : null}
              </View>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  logoStack: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoTile: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: mono.semiBold,
    fontSize: 15,
    letterSpacing: 4,
    color: colors.textPrimary,
  },
  hero: {
    width: '100%',
    flex: 1,
    marginVertical: spacing.lg,
    maxHeight: 300,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  heroGlow: {
    width: 132,
    height: 132,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCaption: {
    fontFamily: mono.medium,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textMuted,
  },
  footer: {
    width: '100%',
    gap: spacing.md,
  },
  headline: {
    fontFamily: display.extraBold,
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  headlineAccent: {
    color: colors.accent,
  },
  disclaimer: {
    ...type.caption,
    color: colors.textMuted,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: {
    ...type.heading,
    color: colors.textPrimary,
  },
  methodDisabled: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    opacity: 0.6,
  },
  methodLabelDisabled: {
    ...type.button,
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    fontFamily: mono.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontFamily: mono.bold,
  },
  error: {
    ...type.caption,
    textAlign: 'center',
    color: colors.danger,
  },
});
