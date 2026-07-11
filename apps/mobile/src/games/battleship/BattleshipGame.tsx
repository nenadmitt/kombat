import { useRef } from 'react';
import { Alert } from 'react-native';
import {
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import type { StakeAsset } from '@gaming-platform/core';

import BattleshipPlayScreen from './game/BattleshipPlayScreen';
import WaitingForOpponent from './game/WaitingForOpponent';
import type { BattleshipEngine } from './game/battleship-engine';
import { useDemoBattleship } from './game/useDemoBattleship';
import { useMultiplayerBattleship } from './game/useMultiplayerBattleship';
import BattleshipSetupScreen from './setup/BattleshipSetupScreen';

/**
 * Battleship container. Owns the mode via one of two engines, chosen from the
 * route: the `Battleship` route carries a `roomId` (socket multiplayer), while
 * the demo `BattleshipSetup` route has none (local bot). Drives the shared
 * flow: fleet setup → (waiting) → the pure-UI play screen.
 */
/** Stake info riding on the route (staked multiplayer matches only). */
export type MatchStakeInfo = { token: StakeAsset; amount: string };

export default function BattleshipGame() {
  const navigation = useNavigation();
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
  const onExit = () => navigation.goBack();

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
  // Set when the user has already confirmed leaving (e.g. the waiting screen's
  // own cancel dialog) so the navigation guard lets that exit pass silently.
  const exitConfirmed = useRef(false);

  // Leaving an unfinished multiplayer match (any phase) forfeits it; the demo
  // only guards active play. The result screens exit freely.
  const guardExit =
    engine.playProps.result === null &&
    (isMultiplayer || engine.phase === 'play');

  // Single choke point for every way off this screen: header back, Android
  // back, anything that pops the route (iOS edge-swipe is disabled on the
  // route itself). Confirm, forfeit, then let the blocked action through.
  usePreventRemove(guardExit, ({ data }) => {
    if (exitConfirmed.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      'Leave match?',
      'If you leave now you forfeit and lose the match.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            engine.forfeit();
            navigation.dispatch(data.action);
          },
        },
      ],
    );
  });

  if (engine.phase === 'waiting') {
    return (
      <WaitingForOpponent
        opponent={engine.playProps.opponent}
        deadline={engine.setupDeadline}
        // Cancelling forfeits the match (the confirm dialog lives inside);
        // it already confirmed, so the navigation guard steps aside.
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
        // Plain back — the navigation guard owns the forfeit confirmation.
        onExit={onExit}
        onQuit={onExit}
      />
    );
  }
  return (
    <BattleshipSetupScreen onReady={engine.submitFleet} onExit={onExit} />
  );
}
