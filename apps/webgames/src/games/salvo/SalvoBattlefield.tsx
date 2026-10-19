import {
  SalvoSide,
  aimGuide,
  clampAngle,
  groundAt,
  muzzleOf,
  slopeAt,
  type SalvoPoint,
  type SalvoTerrain,
} from '@gaming-platform/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SalvoBlast, SalvoBlastDefs } from './SalvoBlast';
import { SalvoTank } from './SalvoTank';
import type { SalvoSeatView } from './salvo-engine';
import {
  BACK_RIDGES,
  ENEMY_BODY,
  FRONT_RIDGE,
  SALVO_FIELD_HEIGHT,
  SALVO_FIELD_WIDTH,
  SKY_HORIZON,
  SKY_MID,
  SKY_TOP,
  STARS,
  TERRAIN_FILL,
  closedRidge,
  pathLine,
  terrainPath,
  terrainRim,
} from './salvo-theme';

const BLAST_MS = 620;

type Props = {
  terrain: SalvoTerrain;
  seats: SalvoSeatView[];
  width: number;
  trajectory: SalvoPoint[] | null;
  trajectorySide: SalvoSide | null;
  impact: SalvoPoint | null;
  impactId: number | null;
  shell: SalvoPoint | null;
  aiming: SalvoSide | null;
  destroyed: SalvoSide | null;
  draggableSide: SalvoSide | null;
  onAimAngle: (angle: number) => void;
};

export function SalvoBattlefield({
  terrain,
  seats,
  width,
  trajectory,
  trajectorySide,
  impact,
  impactId,
  shell,
  aiming,
  destroyed,
  draggableSide,
  onAimAngle,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const height = (width * SALVO_FIELD_HEIGHT) / SALVO_FIELD_WIDTH;

  // Gameplay scales uniformly; the decorative parallax backdrop just stretches.
  const sx = width / SALVO_FIELD_WIDTH;
  const sy = height / SALVO_FIELD_HEIGHT;
  const px = (x: number) => x * sx;
  const py = (y: number) => height - y * sx;

  const ground = useMemo(
    () => terrainPath(terrain.heights, sx, height),
    [terrain.heights, sx, height],
  );
  const rim = useMemo(
    () => terrainRim(terrain.heights, sx, height),
    [terrain.heights, sx, height],
  );
  const arc = useMemo(
    () =>
      trajectory && trajectory.length > 1
        ? pathLine(trajectory, sx, height)
        : null,
    [trajectory, sx, height],
  );

  const blast = useBlastProgress(impactId, BLAST_MS);

  const draggable = draggableSide === null ? null : seats.find(s => s.side === draggableSide);
  const dragMuzzle = draggable
    ? muzzleOf(terrain, {
        side: draggable.side,
        x: draggable.x,
        hp: draggable.hp,
        angle: draggable.angle,
        power: draggable.power,
      })
    : null;

  function aimAt(event: React.PointerEvent) {
    if (!draggable || !dragMuzzle || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = width / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;
    const forward =
      draggable.side === SalvoSide.Left ? x - px(dragMuzzle.x) : px(dragMuzzle.x) - x;
    const rise = py(dragMuzzle.y) - y;
    const deg = (Math.atan2(rise, Math.max(forward, 0.001)) * 180) / Math.PI;
    onAimAngle(Math.round(clampAngle(deg)));
  }

  const dragging = useRef(false);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="salvo-field"
      style={{ touchAction: 'none' }}
      onPointerDown={event => {
        if (!draggable) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        aimAt(event);
      }}
      onPointerMove={event => {
        if (dragging.current) aimAt(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <defs>
        <linearGradient id="salvo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SKY_TOP} />
          <stop offset="52%" stopColor={SKY_MID} />
          <stop offset="100%" stopColor={SKY_HORIZON} />
        </linearGradient>
      </defs>
      <SalvoBlastDefs />

      <rect x={0} y={0} width={width} height={height} fill="url(#salvo-sky)" />

      {STARS.map(star => (
        <circle
          key={`${star.x},${star.y}`}
          cx={star.x * sx}
          cy={star.y * sy}
          r={1.4}
          fill="#fff"
          opacity={star.o}
        />
      ))}

      <g transform={`scale(${sx}, ${sy})`}>
        {BACK_RIDGES.map(ridge => (
          <path
            key={ridge.fill}
            d={closedRidge(ridge.path)}
            fill={ridge.fill}
            opacity={ridge.opacity}
          />
        ))}
      </g>

      <path d={ground} fill={TERRAIN_FILL} />
      <path d={rim} fill="none" stroke="var(--lime)" strokeWidth={1.6} opacity={0.75} />

      <g transform={`scale(${sx}, ${sy})`}>
        <path d={closedRidge(FRONT_RIDGE)} fill="#080910" opacity={0.55} />
      </g>

      {arc && (
        <path
          d={arc}
          fill="none"
          stroke={trajectorySide === SalvoSide.Right ? ENEMY_BODY : 'var(--lime)'}
          strokeWidth={1.6}
          strokeDasharray="2 7"
          opacity={0.9}
        />
      )}

      {seats.map(seat => (
        <SalvoTank
          key={seat.side}
          side={seat.side}
          x={px(seat.x)}
          y={py(groundAt(terrain, seat.x))}
          angle={seat.angle}
          tilt={slopeAt(terrain, seat.x)}
          destroyed={destroyed === seat.side || seat.hp <= 0}
          scale={sx}
        />
      ))}

      {aiming !== null &&
        (() => {
          const seat = seats.find(s => s.side === aiming);
          if (!seat) return null;
          const tank = {
            side: seat.side,
            x: seat.x,
            hp: seat.hp,
            angle: seat.angle,
            power: seat.power,
          };
          return aimGuide(terrain, tank).map((point, index) => (
            <circle
              key={index}
              cx={px(point.x)}
              cy={py(point.y)}
              r={Math.max(1, (3 - index * 0.5) * sx)}
              fill={seat.side === SalvoSide.Right ? ENEMY_BODY : 'var(--lime)'}
              opacity={0.7 - index * 0.14}
            />
          ));
        })()}

      {dragMuzzle && (
        <circle
          cx={px(dragMuzzle.x)}
          cy={py(dragMuzzle.y)}
          r={18 * sx}
          fill="none"
          stroke="var(--lime)"
          strokeWidth={1.2}
          strokeDasharray="3 4"
          opacity={0.45}
        />
      )}

      {impact && blast === null && (
        <g opacity={0.8}>
          <circle
            cx={px(impact.x)}
            cy={py(impact.y)}
            r={13 * sx}
            fill="none"
            stroke="var(--gold)"
            strokeWidth={1.4}
          />
          <circle cx={px(impact.x)} cy={py(impact.y)} r={3 * sx} fill="var(--gold)" />
        </g>
      )}

      {impact && blast !== null && (
        <SalvoBlast
          cx={px(impact.x)}
          cy={py(impact.y)}
          radius={(destroyed !== null ? 46 : 26) * sx}
          progress={blast}
        />
      )}

      {shell && (
        <g>
          <circle cx={px(shell.x)} cy={py(shell.y)} r={5 * sx} fill="var(--gold)" opacity={0.35} />
          <circle cx={px(shell.x)} cy={py(shell.y)} r={2.8 * sx} fill="var(--gold)" />
        </g>
      )}
    </svg>
  );
}

function useBlastProgress(key: number | null, duration: number): number | null {
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (key === null) {
      setProgress(null);
      return;
    }
    let frame = 0;
    const started = Date.now();
    setProgress(0);
    const tick = () => {
      const p = Math.min(1, (Date.now() - started) / duration);
      setProgress(p < 1 ? p : null);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, duration]);

  return progress;
}
