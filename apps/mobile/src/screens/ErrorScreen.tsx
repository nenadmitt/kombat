import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

type Props = {
  message: string;
  onRetry: () => void;
};

export default function ErrorScreen({ message, onRetry }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.icon}>📡</Text>
        <Text style={styles.title}>Connection trouble</Text>
        <Text style={styles.message}>{message}</Text>

        <Pressable
          onPress={onRetry}
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
            <Text style={styles.buttonText}>Try Again</Text>
          </GradientView>
        </Pressable>
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
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  buttonWrapper: {
    width: '100%',
    borderRadius: radius.button,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  button: {
    height: 52,
    width: '100%',
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
