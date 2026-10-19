import { useRef } from 'react';
import { useNavigation, usePreventRemove, useRoute } from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import MatchLoading from '../MatchLoading';
import { useMatchExit } from '../use-match-exit';
import SalvoPlayScreen from './SalvoPlayScreen';
import type { SalvoEngine } from './salvo-engine';
import { useLocalSalvo } from './useLocalSalvo';
import { useMultiplayerSalvo } from './useMultiplayerSalvo';

export default function SalvoGame() {
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

  const onExit = useMatchExit();

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
      <MatchLoading
        error={engine.waitingError}
        // Always forfeit: the server rejects it unless the caller is in a live match. Only the dialog is skipped.
        onLeave={() => {
          exitConfirmed.current = true;
          engine.forfeit();
          onExit();
        }}
      />
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

