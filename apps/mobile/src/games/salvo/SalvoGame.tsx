import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation, usePreventRemove, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import SalvoPlayScreen from './SalvoPlayScreen';
import type { SalvoEngine } from './salvo-engine';
import { useLocalSalvo } from './useLocalSalvo';
import { useMultiplayerSalvo } from './useMultiplayerSalvo';

/**
 * Salvo container - the same route split as the other games: the `Salvo`
 * route carries a roomId (socket multiplayer, server-authoritative), the demo
 * `SalvoSetup` route has none (local bot duel).
 */
export default function SalvoGame() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = route.params as
    | { roomId?: string; stakeToken?: StakeAsset | null; stakeAmount?: string | null }
    | undefined;
  const roomId = params?.roomId;
  const stake =
    params?.stakeToken !== undefined &&
    params?.stakeToken !== null &&
    params?.stakeAmount
      ? { token: params.stakeToken, amount: params.stakeAmount }
      : null;

  /**
   * Leaving the duel. A plain goBack() is dropped with "GO_BACK was not
   * handled by any navigator" whenever nothing sits under this route - a cold
   * start or a deep link straight into a match - so fall back to the tabs.
   */
  const onExit = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  if (!roomId) {
    return <DemoSalvoGame stake={stake} onExit={onExit} />;
  }
  return <MultiplayerSalvoGame roomId={roomId} stake={stake} onExit={onExit} />;
}

type Stake = { token: StakeAsset; amount: string } | null;

function DemoSalvoGame({ stake, onExit }: { stake: Stake; onExit: () => void }) {
  const engine = useLocalSalvo();
  return (
    <SalvoGameFlow
      engine={engine}
      isMultiplayer={false}
      stake={stake}
      onExit={onExit}
    />
  );
}

function MultiplayerSalvoGame({
  roomId,
  stake,
  onExit,
}: {
  roomId: string;
  stake: Stake;
  onExit: () => void;
}) {
  const engine = useMultiplayerSalvo(roomId);
  return (
    <SalvoGameFlow engine={engine} isMultiplayer stake={stake} onExit={onExit} />
  );
}

function SalvoGameFlow({
  engine,
  isMultiplayer,
  stake,
  onExit,
}: {
  engine: SalvoEngine;
  isMultiplayer: boolean;
  stake: Stake;
  onExit: () => void;
}) {
  const navigation = useNavigation();
  const confirm = useConfirm();
  const exitConfirmed = useRef(false);
  const unfinished = engine.playProps.result === null;

  usePreventRemove(unfinished, ({ data }) => {
    if (exitConfirmed.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirm({
      title: 'Leave the duel?',
      message: isMultiplayer
        ? 'You forfeit the match and your opponent takes the field.'
        : 'Your tank is abandoned and the match is scored as a loss.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      icon: 'flag',
      destructive: true,
    }).then(ok => {
      if (ok) {
        exitConfirmed.current = true;
        engine.forfeit();
        navigation.dispatch(data.action);
      }
    });
  });

  if (engine.phase === 'waiting') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SalvoPlayScreen
      {...engine.playProps}
      stake={stake}
      onExit={onExit}
      onQuit={onExit}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.salvoGround,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
