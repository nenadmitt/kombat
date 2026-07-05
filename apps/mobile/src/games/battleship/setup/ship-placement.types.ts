export type Orientation = 'h' | 'v';

export type ShipDef = {
  id: string;
  label: string;
  size: number;
  color: string;
};

export type Cell = { r: number; c: number };

export type Placement = {
  row: number;
  col: number;
  orientation: Orientation;
};

export type Preview = {
  cells: Cell[];
  valid: boolean;
};
