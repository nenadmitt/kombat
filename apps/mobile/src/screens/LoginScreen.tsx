import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLoginWithEmail } from '@privy-io/expo';

import type { RootStackParamList } from '../navigation/types';
import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

/**
 * Email OTP login via Privy: enter email → receive a 6-digit code → verify.
 * On success `usePrivy().user` becomes non-null and RootNavigator swaps to
 * the authenticated stack (Wallet) automatically.
 */
export default function LoginScreen(_props: Props) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { sendCode, loginWithCode, state } = useLoginWithEmail({
    onSendCodeSuccess() {
      setErrorMessage(null);
      setStep('code');
    },
    onError(err) {
      setErrorMessage(err.message);
    },
  });

  const busy =
    state.status === 'sending-code' || state.status === 'submitting-code';

  const handleSendCode = async () => {
    setErrorMessage(null);
    await sendCode({ email: email.trim() });
  };

  const handleLogin = async () => {
    setErrorMessage(null);
    // Login success flips `user` in RootNavigator — no manual navigation.
    await loginWithCode({ code: code.trim(), email: email.trim() });
  };

  const canSendCode = /\S+@\S+\.\S+/.test(email.trim()) && !busy;
  const canLogin = code.trim().length >= 6 && !busy;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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

          {/* Headline */}
          <Text style={styles.headline}>Play. Compete. Win Crypto.</Text>

          {/* Login form */}
          <View style={styles.form}>
            {step === 'email' ? (
              <>
                <Text style={styles.label}>Log in with email</Text>
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
                />
                <Pressable
                  onPress={handleSendCode}
                  disabled={!canSendCode}
                  style={({ pressed }) => [
                    styles.buttonWrapper,
                    (pressed || !canSendCode) && styles.buttonDimmed,
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
                      {state.status === 'sending-code'
                        ? 'Sending code…'
                        : 'Send code'}
                    </Text>
                  </GradientView>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>
                  Enter the code sent to {email.trim()}
                </Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  maxLength={6}
                  editable={!busy}
                />
                <Pressable
                  onPress={handleLogin}
                  disabled={!canLogin}
                  style={({ pressed }) => [
                    styles.buttonWrapper,
                    (pressed || !canLogin) && styles.buttonDimmed,
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
                      {state.status === 'submitting-code'
                        ? 'Verifying…'
                        : 'Log in'}
                    </Text>
                  </GradientView>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCode('');
                    setStep('email');
                  }}
                  disabled={busy}
                >
                  <Text style={styles.linkText}>Use a different email</Text>
                </Pressable>
              </>
            )}

            {errorMessage ? (
              <Text style={styles.error}>{errorMessage}</Text>
            ) : null}

            <Text style={styles.disclaimer}>
              An embedded wallet will be automatically created for you.
            </Text>
          </View>
        </View>
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
  headline: {
    width: '100%',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.textPrimary,
  },
  form: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    width: '100%',
    fontSize: 15,
    textAlign: 'center',
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.35)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.textPrimary,
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
  },
  buttonWrapper: {
    width: '100%',
    borderRadius: radius.button,
  },
  buttonDimmed: {
    opacity: 0.6,
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
  linkText: {
    fontSize: 14,
    color: colors.brandStart,
    paddingVertical: spacing.xs,
  },
  error: {
    width: '100%',
    fontSize: 13,
    textAlign: 'center',
    color: '#f87171',
  },
  disclaimer: {
    width: '100%',
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
  },
});
