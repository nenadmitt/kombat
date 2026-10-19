import { FLEET, type FleetPlacements, type RevealedShip } from '@gaming-platform/core';

import type { PlacedShip } from '../BattleshipGrid';
import { SHIP_COLORS } from '../setup/ship-placement.constants';

export function toPlacedShips(
  placements: FleetPlacements,
  onlyIds?: Set<string>,
): PlacedShip[] {
  return FLEET.filter(
    s => placements[s.id] && (!onlyIds || onlyIds.has(s.id)),
  ).map(s => ({
    id: s.id,
    size: s.size,
    color: SHIP_COLORS[s.id]!,
    placement: placements[s.id]!,
  }));
}

export function revealedToPlaced(ships: RevealedShip[]): PlacedShip[] {
  return ships.map(s => ({
    id: s.id,
    size: s.size,
    color: SHIP_COLORS[s.id]!,
    placement: s.placement,
  }));
}
