// Battleship domain types now live in @gaming-platform/core (shared with the
// server). Re-exported here so existing imports keep working; the only
// mobile-specific addition is `ShipDef`, which carries a display color.
import type { ShipSpec } from '@gaming-platform/core';

export type {
  Cell,
  FleetPlacements,
  Orientation,
  Placement,
  PowerupKind,
  ShipSpec,
  Shot,
  ShotResult,
} from '@gaming-platform/core';

/** A ship class plus its display color (mobile-only presentation). */
export type ShipDef = ShipSpec & { color: string };
