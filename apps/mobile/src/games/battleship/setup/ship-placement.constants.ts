import { colors } from '../../../theme/colors';
import type { ShipDef } from './ship-placement.types';

export const GRID = 10;
export const LABEL_GUTTER = 22;
export const COLUMN_LABELS = Array.from({ length: GRID }, (_, i) =>
  String.fromCharCode(65 + i),
);
export const ROW_LABELS = Array.from({ length: GRID }, (_, i) => i + 1);

export const SETUP_DURATION_SECONDS = 90;

// No existing theme token fits these specific ship classes, and they aren't
// reused anywhere else, so they stay local rather than in the shared theme.
const SHIP_DESTROYER_COLOR = '#6366f1'; // indigo
// Frigate keeps the old brand blue: brandEnd is now green and would collide
// with the Scout's green (colors.success), so the classes must stay distinct.
const SHIP_FRIGATE_COLOR = '#3b82f6'; // blue

export const SHIPS: ShipDef[] = [
  { id: 'battleship', label: 'Battleship', size: 5, color: colors.brandStart },
  { id: 'destroyer', label: 'Destroyer', size: 4, color: SHIP_DESTROYER_COLOR },
  { id: 'frigate', label: 'Frigate', size: 3, color: SHIP_FRIGATE_COLOR },
  { id: 'scout', label: 'Scout', size: 2, color: colors.success },
];

export const SHIP_BY_ID = Object.fromEntries(
  SHIPS.map(s => [s.id, s]),
) as Record<string, ShipDef>;
