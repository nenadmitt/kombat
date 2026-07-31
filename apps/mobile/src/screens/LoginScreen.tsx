import { useEffect, useRef, useState } from 'react';
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
import Icon, { type IconName } from '../components/Icon';
import { Button, Chip } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type SheetStep = 'methods' | 'email' | 'code';

const CODE_LENGTH = 8;
const CODE_BOX_HEIGHT = 52;
const BACK_BUTTON = 44;
/** Mirrors TOKEN_TTL_MS in the server's authentication service. */
const CODE_TTL_MS = 15 * 60 * 1000;

const SOON_METHODS: { icon: IconName; label: string }[] = [
  { icon: 'google', label: 'Continue with Google' },
  { icon: 'apple', label: 'Continue with Apple' },
];

/** The two-tone split-K brand mark from the redesign's welcome screen. */
function KombatMark({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M28 27 L47 27 L40 48 L46 50 L42 75 L28 75 Z" fill={colors.textPrimary} />
      <Path d="M54 27 L72 27 L72 75 L49 75 L53 50 L47 48 Z" fill={colors.accent} />
    </Svg>
  );
}

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

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
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
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const codeInputRef = useRef<TextInput>(null);

  // A deadline rather than a counter, so a backgrounded app resumes on the
  // real remaining time instead of a stalled tick count.
  useEffect(() => {
    if (step !== 'code') {
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

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
      setExpiresAt(Date.now() + CODE_TTL_MS);
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
  const remainingMs = expiresAt - now;
  const expired = remainingMs <= 0;

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

                <View
                  style={[
                    styles.inputRow,
                    emailFocused && styles.inputRowFocused,
                  ]}
                >
                  <Icon
                    type="mail"
                    color={emailFocused ? colors.accent : colors.textMuted}
                    size={20}
                  />
                  <TextInput
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
                </View>

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

                <View style={styles.assuranceRow}>
                  <Icon type="lock" color={colors.textFaint} size={14} />
                  <Text style={styles.assurance}>
                    We never share your address.
                  </Text>
                </View>
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
                  style={styles.codeRow}
                  onPress={() => codeInputRef.current?.focus()}
                >
                  {Array.from({ length: CODE_LENGTH }, (_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.codeBox,
                        index < code.length && styles.codeBoxFilled,
                        index === code.length && styles.codeBoxActive,
                      ]}
                    >
                      <Text style={styles.codeChar}>{code[index] ?? ''}</Text>
                    </View>
                  ))}
                  <TextInput
                    ref={codeInputRef}
                    style={styles.codeInput}
                    value={code}
                    onChangeText={value =>
                      setCode(value.toUpperCase().slice(0, CODE_LENGTH))
                    }
                    accessibilityLabel="Login code"
                    keyboardType="ascii-capable"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={CODE_LENGTH}
                    caretHidden
                    editable={!busy}
                    autoFocus
                  />
                </Pressable>

                <View style={styles.codeMetaRow}>
                  <Text style={styles.codeMeta}>
                    {expired
                      ? 'Code expired'
                      : `Code expires in ${formatCountdown(remainingMs)}`}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={sendCode}
                    disabled={busy}
                    hitSlop={spacing.xs}
                  >
                    <Text style={[styles.resend, busy && styles.resendBusy]}>
                      Resend
                    </Text>
                  </Pressable>
                </View>

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
    paddingLeft: spacing.xs,
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
    height: '100%',
    fontFamily: mono.medium,
    fontSize: 16,
    color: colors.textPrimary,
  },
  assuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  assurance: {
    ...type.caption,
    color: colors.textFaint,
  },
  codeRow: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  codeBox: {
    flex: 1,
    height: CODE_BOX_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: {
    borderColor: colors.accent,
  },
  codeBoxActive: {
    borderColor: colors.accentBorder,
  },
  codeChar: {
    fontFamily: mono.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  // Invisible capture field over the boxes - the boxes are the visible input.
  codeInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  codeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeMeta: {
    ...type.caption,
    color: colors.textMuted,
  },
  resend: {
    ...type.caption,
    fontFamily: display.extraBold,
    color: colors.accent,
  },
  resendBusy: {
    color: colors.textFaint,
  },
  error: {
    ...type.caption,
    textAlign: 'center',
    color: colors.danger,
  },
});
