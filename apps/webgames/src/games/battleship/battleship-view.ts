import {
  FLEET,
  type FleetPlacements,
  type RevealedShip,
} from '@gaming-platform/core';

import type { PlacedShip } from './battleship-engine';
import { SHIP_COLORS } from './battleship-theme';

/** Turn a fleet (all, or a filtered subset) into coloured ships for rendering. */
export function toPlacedShips(
  placements: FleetPlacements,
  onlyIds?: Set<string>,
): PlacedShip[] {
  return FLEET.filter(
    spec => placements[spec.id] && (!onlyIds || onlyIds.has(spec.id)),
  ).map(spec => ({
    id: spec.id,
    size: spec.size,
    color: SHIP_COLORS[spec.id]!,
    placement: placements[spec.id]!,
  }));
}

/** Turn server-revealed (sunk) ships into coloured ships. */
export function revealedToPlaced(ships: RevealedShip[]): PlacedShip[] {
  return ships.map(ship => ({
    id: ship.id,
    size: ship.size,
    color: SHIP_COLORS[ship.id]!,
    placement: ship.placement,
  }));
}
