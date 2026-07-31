import { useRef, useState } from 'react';
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
import Icon, { type IconName } from '../components/Icon';
import LogoMark from '../components/LogoMark';
import { Button, Chip } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { brand, display, mono, type } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type SheetStep = 'methods' | 'email' | 'code';

const CODE_LENGTH = 8;
const BACK_BUTTON = 44;

const SOON_METHODS: { icon: IconName; label: string }[] = [
  { icon: 'google', label: 'Continue with Google' },
  { icon: 'apple', label: 'Continue with Apple' },
];

function SheetHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.sheetHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Icon type="arrow-left" color={colors.textPrimary} size={20} />
      </Pressable>
      <Text style={styles.sheetTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export default function LoginScreen(_props: Props) {
  const loginWithSession = useCurrentUserStore(
    state => state.loginWithSession,
  );

  const [sheetVisible, setSheetVisible] = useState(false);
  const [step, setStep] = useState<SheetStep>('methods');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [code, setCode] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const emailInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);

  const openSheet = () => {
    setStep('methods');
    setEmail('');
    setCode('');
    setErrorMessage(null);
    setSheetVisible(true);
  };

  const closeSheet = () => setSheetVisible(false);

  const sendCode = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      await apiClient.requestLoginToken(email.trim());
      setCode('');
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
  const canVerify = code.trim().length === CODE_LENGTH && !busy;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.logoStack}>
          <LogoMark size={96} />
          <Text style={styles.wordmark}>kombat</Text>
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
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.sheet} edges={['bottom']}>
            <View style={styles.sheetHandle} />
            {step === 'methods' && (
              <View style={styles.sheetContent}>
                <View style={styles.titleBlock}>
                  <Text style={styles.sheetTitle}>Sign in</Text>
                  <Text style={styles.sheetSubtitle}>
                    No password - we send a one-time code.
                  </Text>
                </View>

                <Button
                  label="Continue with Email"
                  icon="mail"
                  onPress={() => setStep('email')}
                />

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>Coming soon</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.methodList}>
                  {SOON_METHODS.map(method => (
                    <View key={method.label} style={styles.methodDisabled}>
                      <Icon
                        type={method.icon}
                        color={colors.textMuted}
                        size={20}
                      />
                      <Text style={styles.methodLabelDisabled}>
                        {method.label}
                      </Text>
                      <View style={styles.spacer} />
                      <Chip
                        label="Soon"
                        tone="neutral"
                        style={styles.methodChip}
                      />
                    </View>
                  ))}
                </View>

                <Text style={styles.legal}>
                  By continuing you agree to the Terms and Privacy Policy.
                </Text>
              </View>
            )}

            {step === 'email' && (
              <View style={styles.sheetContent}>
                <View style={styles.titleBlock}>
                  <SheetHeader
                    title="Enter your email"
                    onBack={() => setStep('methods')}
                  />
                  <Text style={styles.sheetSubtitle}>
                    We'll send an {CODE_LENGTH}-character code. No password to
                    remember.
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.inputRow,
                    emailFocused && styles.inputRowFocused,
                  ]}
                  onPress={() => emailInputRef.current?.focus()}
                >
                  <Icon
                    type="mail"
                    color={emailFocused ? colors.accent : colors.textMuted}
                    size={20}
                  />
                  <TextInput
                    ref={emailInputRef}
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    editable={!busy}
                    autoFocus
                    onSubmitEditing={() => canSendCode && void sendCode()}
                    returnKeyType="go"
                  />
                </Pressable>

                <Button
                  label={busy ? 'Sending code…' : 'Send code'}
                  onPress={sendCode}
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
                <View style={styles.titleBlock}>
                  <SheetHeader
                    title="Enter your code"
                    onBack={() => setStep('email')}
                  />
                  <Text style={styles.sheetSubtitle}>
                    Sent to{' '}
                    <Text style={styles.sheetSubtitleStrong}>
                      {email.trim()}
                    </Text>
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.inputRow,
                    codeFocused && styles.inputRowFocused,
                  ]}
                  onPress={() => codeInputRef.current?.focus()}
                >
                  <TextInput
                    ref={codeInputRef}
                    style={[styles.input, styles.codeInput]}
                    value={code}
                    onChangeText={value =>
                      setCode(value.toUpperCase().slice(0, CODE_LENGTH))
                    }
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                    placeholder="ABCD1234"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="Login code"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={CODE_LENGTH}
                    editable={!busy}
                    autoFocus
                    onSubmitEditing={() => canVerify && void handleVerify()}
                    returnKeyType="go"
                  />
                </Pressable>

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
  wordmark: {
    fontFamily: brand.bold,
    fontSize: 40,
    letterSpacing: -1.8,
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
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetWrapper: {
    flex: 1,
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
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: BACK_BUTTON,
    height: BACK_BUTTON,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  sheetTitle: {
    ...type.title,
    flexShrink: 1,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    ...type.body,
    color: colors.textMuted,
  },
  sheetSubtitleStrong: {
    fontFamily: display.extraBold,
    color: colors.textPrimary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  methodList: {
    gap: spacing.sm,
  },
  methodDisabled: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    opacity: 0.6,
  },
  methodLabelDisabled: {
    ...type.button,
    color: colors.textMuted,
  },
  // Chip defaults to alignSelf 'flex-start', which top-aligns it in this row.
  methodChip: {
    alignSelf: 'center',
  },
  spacer: {
    flex: 1,
  },
  legal: {
    ...type.caption,
    textAlign: 'center',
    color: colors.textFaint,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  inputRowFocused: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  input: {
    flex: 1,
    // stretch, not height '100%': the row centres its children, which would
    // otherwise leave the field only as tall as its text and hard to hit.
    alignSelf: 'stretch',
    fontFamily: mono.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  codeInput: {
    textAlign: 'center',
    fontFamily: mono.bold,
    fontSize: 24,
    letterSpacing: 8,
  },
  error: {
    ...type.caption,
    textAlign: 'center',
    color: colors.danger,
  },
});
