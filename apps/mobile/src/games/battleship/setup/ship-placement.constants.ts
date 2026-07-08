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

// Ship-class colors. brandEnd is now green (collides with Scout's green) so
// the Frigate keeps the old brand blue, and the Destroyer gets its own indigo.
export const SHIP_COLORS: Record<string, string> = {
  battleship: colors.brandStart,
  destroyer: '#6366f1', // indigo
  frigate: '#3b82f6', // blue
  scout: colors.success,
};

/** The shared fleet spec paired with mobile display colors. */
export const SHIPS: ShipDef[] = FLEET.map(s => ({
  ...s,
  color: SHIP_COLORS[s.id]!,
}));

export const SHIP_BY_ID = Object.fromEntries(
  SHIPS.map(s => [s.id, s]),
) as Record<string, ShipDef>;
