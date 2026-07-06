import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';

import BattleshipPlayScreen from './game/BattleshipPlayScreen';
import BattleshipSetupScreen from './setup/BattleshipSetupScreen';
import type { Placement } from './setup/ship-placement.types';

type Phase = 'setup' | 'game';

/** Battleship, single-player local screen: fleet setup, then the battle itself. */
export default function BattleshipGame() {
  const navigation = useNavigation();
  const [phase, setPhase] = useState<Phase>('setup');
  const [placements, setPlacements] = useState<Record<string, Placement>>({});

  if (phase === 'game') {
    return (
      <BattleshipPlayScreen
        placements={placements}
        onExit={() => setPhase('setup')}
        onQuit={() => navigation.goBack()}
      />
    );
  }

  return (
    <BattleshipSetupScreen
      onExit={() => navigation.goBack()}
      onReady={fleet => {
        setPlacements(fleet);
        setPhase('game');
      }}
    />
  );
}
