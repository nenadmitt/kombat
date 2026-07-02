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
import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type SheetStep = 'methods' | 'email' | 'code';

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
          <GradientView
            colors={brandGradient.colors}
            positions={brandGradient.positions}
            style={styles.logoIcon}
          >
            <Text style={styles.logoGem}>💎</Text>
          </GradientView>
          <Text style={styles.wordmark}>KRYPTOKOMBAT</Text>
        </View>

        {/* Hero visual */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>⚔️</Text>
        </View>

        {/* Footer: headline + CTA */}
        <View style={styles.footer}>
          <Text style={styles.headline}>Play. Compete. Win Crypto.</Text>

          <View style={styles.ctaBlock}>
            <Pressable
              onPress={openSheet}
              style={({ pressed }) => [
                styles.buttonWrapper,
                pressed && styles.buttonPressed,
              ]}
            >
              <GradientView
                colors={brandGradient.colors}
                positions={brandGradient.positions}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </GradientView>
            </Pressable>

            <Text style={styles.disclaimer}>
              By continuing you agree to the Terms of Service.
            </Text>
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
            {step === 'methods' && (
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>Sign in</Text>

                <Pressable
                  onPress={() => setStep('email')}
                  style={styles.methodRow}
                >
                  <Text style={styles.methodLabel}>Continue with Email</Text>
                </Pressable>

                <View style={[styles.methodRow, styles.methodRowDisabled]}>
                  <Text style={styles.methodLabelDisabled}>
                    Continue with Google
                  </Text>
                  <Text style={styles.comingSoon}>Coming soon</Text>
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
                  placeholderTextColor={colors.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  editable={!busy}
                  autoFocus
                />
                <Pressable
                  onPress={handleSendCode}
                  disabled={!canSendCode}
                  style={({ pressed }) => [
                    styles.sheetButtonWrapper,
                    (pressed || !canSendCode) && styles.buttonPressed,
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
                      {busy ? 'Sending code…' : 'Send code'}
                    </Text>
                  </GradientView>
                </Pressable>
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
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  maxLength={8}
                  editable={!busy}
                  autoFocus
                />
                <Pressable
                  onPress={handleVerify}
                  disabled={!canVerify}
                  style={({ pressed }) => [
                    styles.sheetButtonWrapper,
                    (pressed || !canVerify) && styles.buttonPressed,
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
                      {busy ? 'Verifying…' : 'Verify'}
                    </Text>
                  </GradientView>
                </Pressable>
                <Pressable onPress={() => setStep('email')} disabled={busy}>
                  <Text style={styles.linkText}>Use a different email</Text>
                </Pressable>
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
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.logo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGem: {
    fontSize: 40,
  },
  wordmark: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  hero: {
    width: '100%',
    height: 280,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: {
    fontSize: 96,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.lg,
  },
  headline: {
    width: '100%',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.textPrimary,
  },
  ctaBlock: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonWrapper: {
    width: '100%',
    borderRadius: radius.button,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  button: {
    height: 56,
    width: '100%',
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  disclaimer: {
    width: '100%',
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  methodRow: {
    height: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  methodRowDisabled: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  methodLabelDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  comingSoon: {
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 22,
    letterSpacing: 6,
  },
  sheetButtonWrapper: {
    width: '100%',
    borderRadius: radius.button,
  },
  linkText: {
    fontSize: 14,
    color: colors.brandStart,
    textAlign: 'center',
  },
  error: {
    fontSize: 13,
    textAlign: 'center',
    color: '#f87171',
  },
});
