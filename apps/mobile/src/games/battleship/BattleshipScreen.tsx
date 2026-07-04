import { useEffect, useState } from 'react';
import {
  FlatList,
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

import type { RootStackParamList } from '../../navigation/types';
import { useWebsocketStore } from '../../store/websocket.store';
import { colors, radius, spacing } from '../../theme/colors';
import { fonts } from '../../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Battleship'>;

/**
 * Placeholder for real Battleship gameplay — just proves the room -> join ->
 * shared-realtime-screen plumbing works. Both players land here and see the
 * same message log, kept in memory server-side (WebsocketsGateway), not
 * persisted anywhere.
 */
export default function BattleshipScreen({ route }: Props) {
  const { roomId } = route.params;
  const joinChannel = useWebsocketStore(state => state.joinChannel);
  const leaveChannel = useWebsocketStore(state => state.leaveChannel);
  const on = useWebsocketStore(state => state.on);
  const emit = useWebsocketStore(state => state.emit);

  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    const unsubscribe = on('game:message', payload => {
      if (Array.isArray(payload)) {
        setMessages(payload as string[]);
      }
    });

    return () => {
      unsubscribe();
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    emit('game:message', { roomId, text });
    setDraft('');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          style={styles.flex}
          contentContainerStyle={styles.messages}
          data={messages}
          keyExtractor={(_, index) => String(index)}
          renderItem={({ item }) => <Text style={styles.message}>{item}</Text>}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendText}>SEND</Text>
          </Pressable>
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
  messages: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  message: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  input: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 4,
    color: colors.textPrimary,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: colors.brandStart,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 8,
  },
  sendText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
