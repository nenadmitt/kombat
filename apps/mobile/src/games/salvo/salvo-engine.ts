import type {
  SalvoDamageKind,
  SalvoEndReason,
  SalvoPlayerStats,
  SalvoPoint,
  SalvoSide,
  SalvoTerrain,
} from '@gaming-platform/core';

export type SalvoSeatView = {
  side: SalvoSide;
  name: string;
  initial: string;
  isMe: boolean;
  hp: number;
  x: number;
  angle: number;
  power: number;
};

export type SalvoFlight = {
  shooter: SalvoSide;
  path: SalvoPoint[];
  shell: SalvoPoint;
  id: number;
};

export type SalvoTrail = {
  shooter: SalvoSide;
  path: SalvoPoint[];
  impact: SalvoPoint;
  id: number;
};

export type SalvoDamageHit = {
  side: SalvoSide;
  amount: number;
  kind: SalvoDamageKind;
};

export type SalvoDamageEvent = {
  id: number;
  hits: SalvoDamageHit[];
};

export type SalvoPlayProps = {
  terrain: SalvoTerrain;
  seats: SalvoSeatView[];
  me: SalvoSide;
  myTurn: boolean;
  armed: boolean;
  movesLeft: number;
  wind: number;
  shotNumber: number;
  round: number;
  flight: SalvoFlight | null;
  trail: SalvoTrail | null;
  aiming: SalvoSide | null;
  damage: SalvoDamageEvent | null;
  destroyed: SalvoSide | null;
  notice: string | null;
  turnDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: SalvoEndReason | null;
  stats: Record<SalvoSide, SalvoPlayerStats>;
  onAim: (aim: { angle?: number; power?: number }) => void;
  onMove: (direction: -1 | 1) => void;
  onFire: () => void;
  onTimerExpire: () => void;
};

export type SalvoEngine = {
  phase: 'waiting' | 'play';
  waitingError?: string | null;
  forfeit: () => void;
  playProps: SalvoPlayProps;
};
