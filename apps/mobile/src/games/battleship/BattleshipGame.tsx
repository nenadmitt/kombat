import { useNavigation, useRoute } from '@react-navigation/native';

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
export default function BattleshipGame() {
  const navigation = useNavigation();
  const route = useRoute();
  const roomId = (route.params as { roomId?: string } | undefined)?.roomId;
  const onExit = () => navigation.goBack();

  if (!roomId) {
    return <DemoBattleshipGame onExit={onExit} />;
  }
  return <MultiplayerBattleshipGame roomId={roomId} onExit={onExit} />;
}

function DemoBattleshipGame({ onExit }: { onExit: () => void }) {
  const engine = useDemoBattleship();
  return <BattleshipGameFlow engine={engine} onExit={onExit} />;
}

function MultiplayerBattleshipGame({
  roomId,
  onExit,
}: {
  roomId: string;
  onExit: () => void;
}) {
  const engine = useMultiplayerBattleship(roomId);
  return <BattleshipGameFlow engine={engine} onExit={onExit} />;
}

function BattleshipGameFlow({
  engine,
  onExit,
}: {
  engine: BattleshipEngine;
  onExit: () => void;
}) {
  if (engine.phase === 'waiting') {
    return <WaitingForOpponent />;
  }
  if (engine.phase === 'play') {
    return (
      <BattleshipPlayScreen
        {...engine.playProps}
        // Leaving mid-match forfeits (the confirm dialog lives in the screen).
        onExit={() => {
          engine.forfeit();
          onExit();
        }}
        onQuit={onExit}
      />
    );
  }
  return (
    <BattleshipSetupScreen onReady={engine.submitFleet} onExit={onExit} />
  );
}
