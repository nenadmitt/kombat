import { useRef } from 'react';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import { useMatchExit } from '../use-match-exit';
import BattleshipPlayScreen from './game/BattleshipPlayScreen';
import WaitingForOpponent from './game/WaitingForOpponent';
import type { BattleshipEngine } from './game/battleship-engine';
import { useDemoBattleship } from './game/useDemoBattleship';
import { useMultiplayerBattleship } from './game/useMultiplayerBattleship';
import BattleshipSetupScreen from './setup/BattleshipSetupScreen';

export type MatchStakeInfo = { token: StakeAsset; amount: string };

export default function BattleshipGame() {
  const route = useRoute();
  const params = route.params as
    | { roomId?: string; stakeToken?: StakeAsset | null; stakeAmount?: string | null }
    | undefined;
  const roomId = params?.roomId;
  const stake: MatchStakeInfo | null =
    params?.stakeToken !== undefined &&
    params?.stakeToken !== null &&
    params?.stakeAmount
      ? { token: params.stakeToken, amount: params.stakeAmount }
      : null;
  const onExit = useMatchExit();

  if (!roomId) {
    return <DemoBattleshipGame onExit={onExit} />;
  }
  return (
    <MultiplayerBattleshipGame roomId={roomId} stake={stake} onExit={onExit} />
  );
}

function DemoBattleshipGame({ onExit }: { onExit: () => void }) {
  const engine = useDemoBattleship();
  return (
    <BattleshipGameFlow
      engine={engine}
      isMultiplayer={false}
      stake={null}
      onExit={onExit}
    />
  );
}

function MultiplayerBattleshipGame({
  roomId,
  stake,
  onExit,
}: {
  roomId: string;
  stake: MatchStakeInfo | null;
  onExit: () => void;
}) {
  const engine = useMultiplayerBattleship(roomId);
  return (
    <BattleshipGameFlow
      engine={engine}
      isMultiplayer
      stake={stake}
      onExit={onExit}
    />
  );
}

function BattleshipGameFlow({
  engine,
  isMultiplayer,
  stake,
  onExit,
}: {
  engine: BattleshipEngine;
  isMultiplayer: boolean;
  stake: MatchStakeInfo | null;
  onExit: () => void;
}) {
  const navigation = useNavigation();
  const confirm = useConfirm();
  const exitConfirmed = useRef(false);

  const guardExit =
    engine.playProps.result === null &&
    (isMultiplayer || engine.phase === 'play');

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
      <WaitingForOpponent
        opponent={engine.playProps.opponent}
        deadline={engine.setupDeadline}
        error={engine.waitingError}
        onCancel={() => {
          exitConfirmed.current = true;
          engine.forfeit();
          onExit();
        }}
      />
    );
  }
  if (engine.phase === 'play') {
    return (
      <BattleshipPlayScreen
        {...engine.playProps}
        stake={stake}
        onExit={onExit}
        onQuit={onExit}
      />
    );
  }
  return (
    <BattleshipSetupScreen onReady={engine.submitFleet} onExit={onExit} />
  );
}
