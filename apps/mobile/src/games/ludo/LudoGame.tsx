import { useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import { colors, spacing } from '../../theme/colors';
import { formatRoomCode } from '../room-code';
import LudoPlayScreen from './LudoPlayScreen';
import type { LudoEngine } from './ludo-engine';
import { useDemoLudo } from './useDemoLudo';
import { useMultiplayerLudo } from './useMultiplayerLudo';

/**
 * Ludo container - same pattern as BattleshipGame: the `Ludo` route carries a
 * roomId (socket multiplayer), the demo `LudoSetup` route has none (local
 * bots). There is no setup phase; both engines go straight to the board.
 */
export default function LudoGame() {
  const navigation = useNavigation();
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
  const onExit = () => navigation.goBack();

  if (!roomId) {
    return <DemoLudoGame onExit={onExit} />;
  }
  return <MultiplayerLudoGame roomId={roomId} stake={stake} onExit={onExit} />;
}

function DemoLudoGame({ onExit }: { onExit: () => void }) {
  const engine = useDemoLudo();
  return (
    <LudoGameFlow
      engine={engine}
      isMultiplayer={false}
      stake={null}
      roomCode={null}
      onExit={onExit}
    />
  );
}

function MultiplayerLudoGame({
  roomId,
  stake,
  onExit,
}: {
  roomId: string;
  stake: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
}) {
  const engine = useMultiplayerLudo(roomId);
  return (
    <LudoGameFlow
      engine={engine}
      isMultiplayer
      stake={stake}
      roomCode={formatRoomCode(roomId)}
      onExit={onExit}
    />
  );
}

function LudoGameFlow({
  engine,
  isMultiplayer,
  stake,
  roomCode,
  onExit,
}: {
  engine: LudoEngine;
  isMultiplayer: boolean;
  stake: { token: StakeAsset; amount: string } | null;
  roomCode: string | null;
  onExit: () => void;
}) {
  const navigation = useNavigation();
  const confirm = useConfirm();
  const exitConfirmed = useRef(false);

  // Leaving an unfinished multiplayer match eliminates you (forfeit); the
  // demo exits freely - there's nothing at stake against bots.
  const guardExit = isMultiplayer && engine.playProps.result === null;

  usePreventRemove(guardExit, ({ data }) => {
    if (exitConfirmed.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirm({
      title: 'Leave match?',
      message:
        'Leaving eliminates you from this match. If only one player remains, they win.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      icon: 'flag',
      destructive: true,
    }).then(ok => {
      if (ok) {
        engine.forfeit();
        navigation.dispatch(data.action);
      }
    });
  });

  if (engine.phase === 'waiting') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
        {/* A stuck load must say why - a mute spinner is undebuggable. */}
        {engine.waitingError ? (
          <Text style={styles.loadingError}>{engine.waitingError}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <LudoPlayScreen
      {...engine.playProps}
      roomCode={roomCode}
      stake={stake}
      onExit={onExit}
      onQuit={onExit}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingError: {
    marginTop: spacing.md,
    marginHorizontal: spacing.xl,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
  },
});
