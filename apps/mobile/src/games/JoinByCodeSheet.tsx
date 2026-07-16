import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ApiError, type GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { BottomSheet, Button } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';

const CODE_LENGTH = 6;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The code resolved to a joinable room - the caller runs the join flow. */
  onResolved: (room: GameRoomSummary) => void;
};

/**
 * "Join a game" sheet: paste or type a room code and resolve it to a room.
 * On success it hands the room to the caller (GameLobyScreen), which runs the
 * normal join path so staked rooms still confirm before funding.
 */
export default function JoinByCodeSheet({ visible, onClose, onResolved }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCode('');
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePaste = async () => {
    const clip = await Clipboard.getString();
    if (clip) {
      setCode(sanitize(clip));
      setError(null);
    }
  };

  const handleJoin = async () => {
    const normalized = sanitize(code);
    if (normalized.length < CODE_LENGTH) {
      setError('Enter the full room code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const room = await apiClient.getGameRoomByCode(normalized);
      reset();
      onResolved(room);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not find that room.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Join a game" showClose>
      <Text style={styles.subtitle}>
        Enter the room code a friend shared with you.
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          value={code}
          onChangeText={text => {
            setCode(sanitize(text));
            setError(null);
          }}
          placeholder="ABC123"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={CODE_LENGTH}
          style={styles.input}
          selectionColor={colors.accent}
          returnKeyType="go"
          onSubmitEditing={() => void handleJoin()}
        />
        <Pressable
          onPress={handlePaste}
          accessibilityRole="button"
          accessibilityLabel="Paste code"
          style={({ pressed }) => [styles.pasteBtn, pressed && styles.pressed]}
        >
          <Icon type="copy" color={colors.accentLight} size={16} />
          <Text style={styles.pasteText}>Paste</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label="Join Room"
        onPress={() => void handleJoin()}
        loading={loading}
        disabled={loading}
        style={styles.joinBtn}
      />
    </BottomSheet>
  );
}

/** Uppercase, strip anything not in the code alphabet, cap the length. */
function sanitize(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

const styles = StyleSheet.create({
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    fontFamily: mono.bold,
    fontSize: 24,
    letterSpacing: 6,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pasteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  pasteText: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.accentLight,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  joinBtn: {
    marginTop: spacing.lg,
  },
});
