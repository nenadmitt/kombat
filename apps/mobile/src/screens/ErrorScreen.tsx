import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientView } from '../components/GradientView';
import Icon from '../components/Icon';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

type Props = {
  message: string;
  /** Backend/network error code (ErrorCode enum) — shown as fine print for support reference. */
  code: string;
  onRetry: () => void;
};

export default function ErrorScreen({ message, code, onRetry }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Icon type="wifi-off" color={colors.textMuted} size={48} style={styles.icon} />
        <Text style={styles.title}>Connection trouble</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.code}>Error code: {code}</Text>

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
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.textMuted,
  },
  code: {
    fontSize: 12,
    color: colors.textFaint,
    fontFamily: 'Menlo',
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
