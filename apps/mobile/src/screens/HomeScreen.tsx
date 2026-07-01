import { Button, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { APP_NAME } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  // Reads from the global store — updates here reflect changes made on Login.
  const name = useCurrentUserStore(state => state.name);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.greeting}>
        {name ? `Welcome, ${name}!` : 'Not logged in'}
      </Text>
      <Button title="Login" onPress={() => navigation.navigate('Login')} />
      <Button title="Play Battleship" onPress={() => navigation.navigate('Battleship')} />
      <Button title="Go to Screen 2" onPress={() => navigation.navigate('Details')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 24,
  },
  greeting: {
    fontSize: 16,
    color: '#555',
  },
});
