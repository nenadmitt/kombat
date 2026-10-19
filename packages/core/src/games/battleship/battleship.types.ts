export type Orientation = 'h' | 'v';

export type Cell = { r: number; c: number };

export type Placement = {
  row: number;
  col: number;
  orientation: Orientation;
};

export type ShotResult = 'hit' | 'miss' | 'mine';

export type Shot = {
  row: number;
  col: number;
  result: ShotResult;
};

export type MinePlacement = {
  row: number;
  col: number;
};

export type ShipSpec = {
  id: string;
  label: string;
  size: number;
};

export type FleetPlacements = Record<string, Placement>;

export type PowerupKind = 'torpedo' | 'bomb';

export type FireKind = 'single' | PowerupKind;

/** A volley is one FIRE press; it counts as a hit when any of its cells struck a ship. */
export type VolleyStats = {
  fired: number;
  hit: number;
};
