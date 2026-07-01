import { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen(_props: Props) {
  // Subscribe to just the pieces this screen needs.
  const name = useCurrentUserStore(state => state.name);
  const setName = useCurrentUserStore(state => state.setName);
  const reset = useCurrentUserStore(state => state.reset);

  const [draft, setDraft] = useState(name);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Current name: {name ? name : '(none)'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        value={draft}
        onChangeText={setDraft}
        autoCapitalize="words"
      />

      <Button title="Save" onPress={() => setName(draft.trim())} />
      <Button
        title="Clear"
        onPress={() => {
          reset();
          setDraft('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  label: {
    fontSize: 18,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
