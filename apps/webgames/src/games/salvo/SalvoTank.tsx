import { SALVO_TANK_SCALE, SalvoSide } from '@gaming-platform/core';

import { ENEMY_BODY, ENEMY_TREAD, MY_TREAD, WRECK } from './salvo-theme';

type Props = {
  side: SalvoSide;
  /** Screen position of the tank's centre column and the ground under it. */
  x: number;
  y: number;
  /** Barrel elevation in degrees; the barrel tracks the dial live. */
  angle: number;
  destroyed: boolean;
  /** Ground slope in degrees under the hull, positive climbing to the right. */
  tilt?: number;
  /** Terrain-space to screen scale, so the hull grows with the field. */
  scale?: number;
};

/**
 * The tank, layer for layer: a barrel hinged at the turret, a rounded turret
 * cap, the hull and a darker tread shadow. Every offset is a design unit from
 * the mobile sprite, mirrored for the right-hand tank.
 */
export function SalvoTank({
  side,
  x,
  y,
  angle,
  destroyed,
  tilt = 0,
  scale = 1,
}: Props) {
  const left = side === SalvoSide.Left;
  const s = (v: number) => v * scale * SALVO_TANK_SCALE;

  // Local space: the origin sits on the ground under the hull's centre, with
  // the frame reaching s(20) either side. Pieces are placed from the near edge
  // and measured up from the ground, as the design draws them.
  const nearEdge = left ? -s(20) : s(20);
  const pieceX = (offset: number, width: number) =>
    left ? nearEdge + s(offset) : nearEdge - s(offset) - width;
  const pieceY = (bottom: number, height: number) => -s(bottom) - height;

  // The hull leans onto the contour, pivoting on the tracks rather than its
  // centre - which is the origin here.
  const contour = `translate(${x}, ${y}) rotate(${-tilt})`;

  if (destroyed) {
    const hullW = s(30);
    const barW = s(16);
    return (
      <g transform={contour}>
        <ellipse
          cx={0}
          cy={-s(14)}
          rx={s(22)}
          ry={s(13)}
          fill="var(--gold)"
          opacity={0.16}
        />
        <rect
          x={pieceX(4, hullW)}
          y={pieceY(1, s(7))}
          width={hullW}
          height={s(7)}
          rx={s(4)}
          fill={WRECK}
          transform={`rotate(${left ? 7 : -7}, ${pieceX(4, hullW) + hullW / 2}, ${pieceY(1, s(7)) + s(3.5)})`}
        />
        <rect
          x={pieceX(20, barW)}
          y={pieceY(6, s(3))}
          width={barW}
          height={s(3)}
          rx={s(2)}
          fill={WRECK}
          transform={`rotate(${left ? -58 : 58}, ${pieceX(20, barW) + barW / 2}, ${pieceY(6, s(3)) + s(1.5)})`}
        />
      </g>
    );
  }

  const body = left ? 'var(--lime)' : ENEMY_BODY;
  const tread = left ? MY_TREAD : ENEMY_TREAD;

  const barrelW = s(left ? 22 : 20);
  const barrelH = s(3.5);
  const barrelX = pieceX(15, barrelW);
  const barrelY = pieceY(11, barrelH);
  // Elevation is absolute in the physics, so the barrel cancels the hull's
  // lean and still points where the dial says. It hinges on its near edge.
  const hingeX = left ? barrelX : barrelX + barrelW;
  const barrelAngle = (left ? -angle : angle) + tilt;

  const turretW = s(13);
  const hullW = s(29);
  const treadW = s(25);

  return (
    <g transform={contour}>
      <rect
        x={barrelX}
        y={barrelY}
        width={barrelW}
        height={barrelH}
        rx={s(2)}
        fill={body}
        transform={`rotate(${barrelAngle}, ${hingeX}, ${barrelY + barrelH / 2})`}
      />
      <rect
        x={pieceX(9, turretW)}
        y={pieceY(8, s(8))}
        width={turretW}
        height={s(8)}
        rx={s(4)}
        fill={body}
      />
      <rect
        x={pieceX(1, hullW)}
        y={pieceY(1, s(8))}
        width={hullW}
        height={s(8)}
        rx={s(4)}
        fill={body}
      />
      <rect
        x={pieceX(3, treadW)}
        y={pieceY(0, s(2.5))}
        width={treadW}
        height={s(2.5)}
        rx={s(2)}
        fill={tread}
      />
    </g>
  );
}
