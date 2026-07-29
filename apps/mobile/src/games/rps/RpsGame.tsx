import { useRef } from 'react';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import MatchLoading from '../MatchLoading';
import RpsPlayScreen from './RpsPlayScreen';
import type { RpsEngine } from './rps-engine';
import { useDemoRps } from './useDemoRps';
import { useMultiplayerRps } from './useMultiplayerRps';

/**
 * Triple Cut container - same pattern as the other games: the `TripleCut`
 * route carries a roomId (socket multiplayer), the demo `TripleCutSetup`
 * route has none (local bot). No setup phase; both engines start on the
 * match screen.
 */
export default function RpsGame() {
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
    return <DemoRpsGame onExit={onExit} />;
  }
  return <MultiplayerRpsGame roomId={roomId} stake={stake} onExit={onExit} />;
}

function DemoRpsGame({ onExit }: { onExit: () => void }) {
  const engine = useDemoRps();
  return (
    <RpsGameFlow engine={engine} isMultiplayer={false} stake={null} onExit={onExit} />
  );
}

function MultiplayerRpsGame({
  roomId,
  stake,
  onExit,
}: {
  roomId: string;
  stake: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
}) {
  const engine = useMultiplayerRps(roomId);
  return (
    <RpsGameFlow engine={engine} isMultiplayer stake={stake} onExit={onExit} />
  );
}

function RpsGameFlow({
  engine,
  isMultiplayer,
  stake,
  onExit,
}: {
  engine: RpsEngine;
  isMultiplayer: boolean;
  stake: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
}) {
  const navigation = useNavigation();
  const confirm = useConfirm();
  const exitConfirmed = useRef(false);

  // Leaving an unfinished multiplayer match forfeits it; the demo exits free.
  const guardExit = isMultiplayer && engine.playProps.result === null;

  usePreventRemove(guardExit, ({ data }) => {
    if (exitConfirmed.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirm({
      title: 'Leave match?',
      message: 'If you leave now you forfeit and lose the match.',
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
      <MatchLoading
        error={engine.waitingError}
        // A snapshot that never lands must not trap the player. They are not
        // in a playable match yet, so leaving here is not a forfeit: step the
        // navigation guard aside rather than demanding they confirm one.
        onLeave={() => {
          exitConfirmed.current = true;
          onExit();
        }}
      />
    );
  }
  return (
    <RpsPlayScreen
      {...engine.playProps}
      stake={stake}
      onExit={onExit}
      onQuit={onExit}
    />
  );
}

