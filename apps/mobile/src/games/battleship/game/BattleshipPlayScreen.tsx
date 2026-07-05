import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';
import type { Placement } from '../setup/ship-placement.types';

type Props = {
  placements: Record<string, Placement>;
};

/** Placeholder for the actual battle phase — gameplay isn't built yet. */
export default function BattleshipPlayScreen({ placements }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Fleet Deployed</Text>
        <Text style={styles.subtitle}>
          {Object.keys(placements).length} ships placed. Gameplay coming soon.
        </Text>
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
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
