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

export type ShipDef = ShipSpec & { color: string };
