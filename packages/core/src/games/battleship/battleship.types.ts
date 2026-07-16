/** Ship orientation on the board. */
export type Orientation = 'h' | 'v';

/** A board cell in row/column form. */
export type Cell = { r: number; c: number };

/** Where a ship sits: its anchor cell + orientation (extends `size` cells). */
export type Placement = {
  row: number;
  col: number;
  orientation: Orientation;
};

export type ShotResult = 'hit' | 'miss' | 'mine';

/** A resolved shot at a cell. */
export type Shot = {
  row: number;
  col: number;
  result: ShotResult;
};

/** A sea mine armed at a cell of its owner's board. */
export type MinePlacement = {
  row: number;
  col: number;
};

/** A ship class (id/label/size). Presentation (color) lives with the consumer. */
export type ShipSpec = {
  id: string;
  label: string;
  size: number;
};

/** A full or partial fleet, keyed by ship id. */
export type FleetPlacements = Record<string, Placement>;

export type PowerupKind = 'torpedo' | 'bomb';

/** A shot kind: a normal shot or one of the power-ups. */
export type FireKind = 'single' | PowerupKind;

/** Per-player fire-action tally, for end-screen accuracy. A volley is one FIRE
 *  press (single shot or power-up); it counts as a hit when at least one of
 *  its cells struck a ship. */
export type VolleyStats = {
  fired: number;
  hit: number;
};
