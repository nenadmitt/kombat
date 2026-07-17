import { FLEET, GRID } from '@gaming-platform/core';

import { colors } from '../../../theme/colors';
import type { ShipDef } from './ship-placement.types';

export { GRID };

// --- mobile-only presentation + UI layout constants --------------------------

export const LABEL_GUTTER = 22;
export const COLUMN_LABELS = Array.from({ length: GRID }, (_, i) =>
  String.fromCharCode(65 + i),
);
export const ROW_LABELS = Array.from({ length: GRID }, (_, i) => i + 1);

export const SETUP_DURATION_SECONDS = 90;

// Ship-class colors. brandEnd is now green (collides with the Destroyer's
// green), so the mid-fleet gets its own indigo/blue/cyan ladder.
export const SHIP_COLORS: Record<string, string> = {
  carrier: colors.brandStart,
  battleship: '#6366f1', // indigo
  cruiser: '#3b82f6', // blue
  submarine: '#06b6d4', // cyan
  destroyer: colors.success,
};

/** Amber used for armed sea mines (matches the torpedo/blast effects). */
export const MINE_COLOR = '#FBBF24';

/** The shared fleet spec paired with mobile display colors. */
export const SHIPS: ShipDef[] = FLEET.map(s => ({
  ...s,
  color: SHIP_COLORS[s.id]!,
}));

export const SHIP_BY_ID = Object.fromEntries(
  SHIPS.map(s => [s.id, s]),
) as Record<string, ShipDef>;
