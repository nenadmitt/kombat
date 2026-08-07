import { FLEET, GRID, type ShipSpec } from '@gaming-platform/core';

export { GRID };

export type ShipDef = ShipSpec & { color: string };

export const COLUMN_LABELS = Array.from({ length: GRID }, (_, i) =>
  String.fromCharCode(65 + i),
);
export const ROW_LABELS = Array.from({ length: GRID }, (_, i) => i + 1);

/**
 * Ship-class colours, identical to the mobile app. The mid-fleet gets its own
 * indigo/blue/cyan ladder because the brand green collides with the
 * Destroyer's.
 */
export const SHIP_COLORS: Record<string, string> = {
  carrier: '#8ee05a',
  battleship: '#6366f1',
  cruiser: '#3b82f6',
  submarine: '#06b6d4',
  destroyer: '#3ee08f',
};

/** Amber for armed sea mines, matching the torpedo and blast effects. */
export const MINE_COLOR = '#f5b829';

export const SHIPS: ShipDef[] = FLEET.map(spec => ({
  ...spec,
  color: SHIP_COLORS[spec.id]!,
}));

// Marker palette, mirrored from the mobile board so a hit reads the same.
export const HIT_FILL = 'rgba(255, 84, 104, 0.9)';
export const HIT_GLOW = 'rgba(255, 84, 104, 0.55)';
export const MISS_DOT = 'rgba(148, 163, 184, 0.7)';
export const TORPEDO_COLOR = '#f5b829';
export const MINE_GLOW = 'rgba(251, 191, 36, 0.45)';
export const CELL_BORDER = 'rgba(233, 233, 237, 0.09)';
export const ACTIVE_CELL_BORDER = 'rgba(142, 224, 90, 0.55)';

/** Board geometry, in board-space units (the SVG scales via viewBox). */
export const CELL = 32;
export const CELL_GAP = 4;
export const CELL_RADIUS = 6;
export const HULL_PAD = 3;
export const BOARD_SIZE = GRID * CELL;

// Animation timings, mirrored from the mobile board so a volley reads at the
// same pace on both clients.
export const ENTRY_MS = 300;
export const MINE_BLAST_MS = 900;
export const TORPEDO_PER_CELL_MS = 90;
export const SINK_PER_CELL_MS = 150;
