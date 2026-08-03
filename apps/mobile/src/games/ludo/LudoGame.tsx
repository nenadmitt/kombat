import { useRef } from 'react';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import MatchLoading from '../MatchLoading';
import { useMatchExit } from '../use-match-exit';
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
      <MatchLoading
        error={engine.waitingError}
        // Always tell the server, and let it decide. forfeit() is rejected
        // server-side when the match does not exist, has not started, or the
        // caller is not in it - so a genuinely stuck player is not penalised,
        // while anyone who did reach a live match still forfeits it. Only the
        // confirmation dialog is skipped: it is UX, not enforcement, and a
        // client can always just close the app instead.
        onLeave={() => {
          exitConfirmed.current = true;
          engine.forfeit();
          onExit();
        }}
      />
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

