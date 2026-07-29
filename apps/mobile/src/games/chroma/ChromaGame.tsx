import { useRef } from 'react';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import { useConfirm } from '../../components/ui';
import MatchLoading from '../MatchLoading';
import ChromaPlayScreen from './ChromaPlayScreen';
import type { ChromaEngine } from './chroma-engine';
import { useDemoChroma } from './useDemoChroma';
import { useMultiplayerChroma } from './useMultiplayerChroma';

/**
 * Chroma Clash container - same pattern as the other games: the `ChromaClash`
 * route carries a roomId (socket multiplayer), the demo `ChromaClashSetup`
 * route has none (local bots). No setup phase; both engines start on the
 * match screen.
 */
export default function ChromaGame() {
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
    return <DemoChromaGame onExit={onExit} />;
  }
  return (
    <MultiplayerChromaGame roomId={roomId} stake={stake} onExit={onExit} />
  );
}

function DemoChromaGame({ onExit }: { onExit: () => void }) {
  const engine = useDemoChroma();
  return (
    <ChromaGameFlow engine={engine} isMultiplayer={false} stake={null} onExit={onExit} />
  );
}

function MultiplayerChromaGame({
  roomId,
  stake,
  onExit,
}: {
  roomId: string;
  stake: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
}) {
  const engine = useMultiplayerChroma(roomId);
  return (
    <ChromaGameFlow engine={engine} isMultiplayer stake={stake} onExit={onExit} />
  );
}

function ChromaGameFlow({
  engine,
  isMultiplayer,
  stake,
  onExit,
}: {
  engine: ChromaEngine;
  isMultiplayer: boolean;
  stake: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
}) {
  const navigation = useNavigation();
  const confirm = useConfirm();
  const exitConfirmed = useRef(false);

  // Leaving an unfinished multiplayer match eliminates you; the demo exits
  // freely.
  const guardExit = isMultiplayer && engine.playProps.result === null;

  usePreventRemove(guardExit, ({ data }) => {
    if (exitConfirmed.current) {
      navigation.dispatch(data.action);
      return;
    }
    void confirm({
      title: 'Leave match?',
      message:
        'If you leave now you are eliminated - with two players left, your opponent wins.',
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
    <ChromaPlayScreen
      {...engine.playProps}
      stake={stake}
      onExit={onExit}
      onQuit={onExit}
    />
  );
}

