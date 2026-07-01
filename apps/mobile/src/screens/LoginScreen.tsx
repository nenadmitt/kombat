import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const setName = useCurrentUserStore(state => state.setName);

  const handleContinue = () => {
    // Mock auth for now — swap for the real Privy flow later.
    setName('Player');
    navigation.navigate('Home');
  };

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
              onPress={handleContinue}
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
                <Text style={styles.buttonText}>Continue with Privy</Text>
              </GradientView>
            </Pressable>

            <Text style={styles.disclaimer}>
              An embedded wallet will be automatically created for you.
            </Text>
          </View>
        </View>
      </View>
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
});
