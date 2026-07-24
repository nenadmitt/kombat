import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameType } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import { colors, radius, spacing } from '../theme/colors';
import { display, type } from '../theme/typography';

export type GameChoice = {
  gameType: GameType;
  label: string;
  icon: IconName;
  blurb: string;
};

type Props = {
  visible: boolean;
  choices: readonly GameChoice[];
  selected: GameType;
  onSelect: (gameType: GameType) => void;
  onClose: () => void;
};

/** Searchable bottom-sheet game picker (replaces the inline dropdown). */
export default function GamePickerSheet({
  visible,
  choices,
  selected,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(
      c =>
        c.label.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q),
    );
  }, [choices, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.wrapper} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Select game</Text>

          <View style={styles.search}>
            <Icon type="search" color={colors.textMuted} size={18} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search games"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              autoFocus
            />
          </View>

          <View style={styles.list}>
            {filtered.length === 0 ? (
              <Text style={styles.empty}>No games match your search.</Text>
            ) : (
              filtered.map(choice => {
                const isSelected = choice.gameType === selected;
                return (
                  <Pressable
                    key={choice.gameType}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={() => onSelect(choice.gameType)}
                  >
                    <View style={styles.icon}>
                      <Icon type={choice.icon} color={colors.accentLight} size={20} />
                    </View>
                    <View style={styles.text}>
                      <Text style={styles.name}>{choice.label}</Text>
                      <Text style={styles.blurb}>{choice.blurb}</Text>
                    </View>
                    {isSelected ? (
                      <Icon type="check" color={colors.accent} size={18} />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontFamily: type.body.fontFamily,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  list: {
    gap: spacing.sm,
  },
  empty: {
    ...type.caption,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  name: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  blurb: {
    ...type.caption,
    color: colors.textMuted,
  },
});
