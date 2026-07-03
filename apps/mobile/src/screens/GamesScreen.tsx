import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Icon from '../components/Icon';
import type { GamesStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

type Props = NativeStackScreenProps<GamesStackParamList, 'GamesList'>;

const GAMES = [{ key: 'battleship', title: 'Battleship' }] as const;

export default function GamesScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Games</Text>
        {GAMES.map(game => (
          <Pressable
            key={game.key}
            style={styles.card}
            onPress={() => navigation.navigate('Battleship')}
          >
            <Icon type="swords" color={colors.textPrimary} size={28} />
            <Text style={styles.cardTitle}>{game.title}</Text>
          </Pressable>
        ))}
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
    padding: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
