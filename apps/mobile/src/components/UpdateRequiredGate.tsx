import UpdateRequiredScreen from '../screens/UpdateRequiredScreen';
import { useServerStore } from '../store/server.store';
import type { RootStackParamList } from '../navigation/types';

/** Game routes are exempt: blocking mid-match would run out the turn clock
 *  and forfeit a live stake. The wall lands the moment the match is left. */
const GAME_ROUTES = new Set<keyof RootStackParamList>([
  'Battleship',
  'BattleshipSetup',
  'Ludo',
  'LudoSetup',
  'TripleCut',
  'TripleCutSetup',
  'ChromaClash',
  'ChromaClashSetup',
  'Salvo',
  'SalvoSetup',
]);

type Props = {
  currentRoute: string | undefined;
};

export default function UpdateRequiredGate({ currentRoute }: Props) {
  const updateRequired = useServerStore(s => s.updateRequired);

  if (!updateRequired) {
    return null;
  }
  if (currentRoute && GAME_ROUTES.has(currentRoute as keyof RootStackParamList)) {
    return null;
  }
  return <UpdateRequiredScreen />;
}
