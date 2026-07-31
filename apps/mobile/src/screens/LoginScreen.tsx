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
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ApiError } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { apiClient } from '../api/client';
import Glow from '../components/Glow';
import { Button, Chip } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type SheetStep = 'methods' | 'email' | 'code';

/** The two-tone split-K brand mark from the redesign's welcome screen. */
function KombatMark({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M28 27 L47 27 L40 48 L46 50 L42 75 L28 75 Z" fill={colors.textPrimary} />
      <Path d="M54 27 L72 27 L72 75 L49 75 L53 50 L47 48 Z" fill={colors.accent} />
    </Svg>
  );
}

export default function LoginScreen(_props: Props) {
  const loginWithSession = useCurrentUserStore(
    state => state.loginWithSession,
  );

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
      const session = await apiClient.exchangeLoginToken(
        email.trim(),
        code.trim(),
      );
      await loginWithSession(session);
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
        {/* Logo mark + wordmark over an accent bloom. */}
        <View style={styles.logoStack}>
          <Glow
            size={230}
            color={colors.accent}
            opacity={0.32}
            edge={0.66}
            style={styles.logoGlow}
          />
          <KombatMark size={96} />
          <Text style={styles.wordmark}>KOMBAT</Text>
        </View>

        {/* Headline + CTA pushed to the lower third. */}
        <View style={styles.footer}>
          <Text style={styles.headline}>
            Play.{'\n'}Compete.{'\n'}
            <Text style={styles.headlineAccent}>Win.</Text>
          </Text>

          <Button label="Start Winning" onPress={openSheet} />

          <Text style={styles.tagline}>
            Winner takes the pot. No house, no bots.
          </Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  logoStack: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logoGlow: {
    position: 'absolute',
    top: -16,
    left: '50%',
    marginLeft: -115,
  },
  wordmark: {
    fontFamily: mono.semiBold,
    fontSize: 20,
    letterSpacing: 8,
    // Optical-centre the wide tracking (the trailing space pushes it right).
    paddingLeft: 8,
    color: colors.textPrimary,
  },
  footer: {
    width: '100%',
    gap: spacing.md,
  },
  headline: {
    fontFamily: display.extraBold,
    fontSize: 47,
    lineHeight: 46,
    letterSpacing: -1.4,
    color: colors.textPrimary,
  },
  headlineAccent: {
    color: colors.accent,
  },
  tagline: {
    ...type.caption,
    textAlign: 'center',
    color: colors.textMuted,
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
