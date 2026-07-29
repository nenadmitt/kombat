import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import {
  SALVO_FIELD_HEIGHT,
  SALVO_FIELD_WIDTH,
  SalvoSide,
  aimGuide,
  clampAngle,
  groundAt,
  muzzleOf,
  slopeAt,
  type SalvoPoint,
  type SalvoTerrain,
} from '@gaming-platform/core';

import { colors } from '../../theme/colors';
import SalvoBlast from './SalvoBlast';
import SalvoTank from './SalvoTank';
import type { SalvoSeatView } from './salvo-engine';

export type SalvoBattlefieldProps = {
  /** Full world size in px - wider than the viewport it scrolls inside. */
  width: number;
  height: number;
  terrain: SalvoTerrain;
  tanks: SalvoSeatView[];
  /** Arc to draw dashed behind the shell: the last resolved or in-flight shot. */
  trajectory: SalvoPoint[] | null;
  /** Whose shot the arc belongs to - mine reads in accent, theirs in steel. */
  trajectorySide: SalvoSide | null;
  /** Where the shell is right now while a shot plays out. */
  shell: SalvoPoint | null;
  /** Landing point of the last resolved shot, ringed like the design. */
  impact: SalvoPoint | null;
  /** Ring the tank a shell is inbound on. */
  incomingOn: SalvoSide | null;
  /** Whoever is lining up a shot gets tick marks off the barrel. */
  aimingSide: SalvoSide | null;
  /** Identifies the landed shot, so a new impact fires a fresh blast. */
  impactId: number | null;
  /** Hull destroyed this match: burns with a bigger, slower blast. */
  destroyedSide: SalvoSide | null;
  /** Tank whose barrel may be dragged to aim, or null when aiming is locked. */
  draggableSide: SalvoSide | null;
  /** Fired with the elevation the drag is pointing at, already clamped. */
  onAimAngle: (angle: number) => void;
};

/** Touch target around the muzzle, in points. Generous enough to grab with a
 *  thumb without swallowing the drags that scroll the map. */
const AIM_HANDLE = 150;

/** The design's parallax ridges, authored against its 328x340 battlefield box. */
const BACK_RIDGES = [
  { path: 'M0,116 C44,96 84,126 132,108 C182,90 220,120 268,104 C296,95 314,110 328,102', fill: '#0e1220', opacity: 0.5 },
  { path: 'M0,164 C40,148 78,176 126,160 C176,143 214,170 262,156 C294,147 312,162 328,154', fill: '#0c1019', opacity: 0.6 },
];
const FRONT_RIDGE =
  'M0,308 C40,300 70,316 108,312 C150,308 172,286 210,296 C254,308 290,318 328,310';

/** Static star field, matching the three specks in the design. */
const STARS = [
  { x: 44, y: 34, o: 0.45 },
  { x: 206, y: 22, o: 0.3 },
  { x: 268, y: 58, o: 0.38 },
];

/**
 * The Salvo playfield: sky gradient, the design's parallax ridges, the live
 * destructible terrain, both tanks and the shell's dashed arc. Authored in the
 * design's 328x340 terrain space and scaled uniformly into a world wider than
 * the screen, so the caller can scroll a camera across it.
 */
export default function SalvoBattlefield({
  width,
  height,
  terrain,
  tanks,
  trajectory,
  trajectorySide,
  shell,
  impact,
  incomingOn,
  aimingSide,
  impactId,
  destroyedSide,
  draggableSide,
  onAimAngle,
}: SalvoBattlefieldProps) {
  // Gameplay scales uniformly, so a 45-degree barrel throws a 45-degree arc.
  // The parallax backdrop is decorative and simply stretches to fill instead.
  const sx = width / SALVO_FIELD_WIDTH;
  const sy = height / SALVO_FIELD_HEIGHT;
  const arcColor =
    trajectorySide === SalvoSide.Right ? colors.salvoEnemy : colors.accent;

  /** Terrain space is y-up from the bottom; screen space is y-down from the top. */
  const px = (x: number) => x * sx;
  const py = (y: number) => height - y * sx;

  const groundPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(0, height);
    for (let x = 0; x < terrain.width; x++) {
      p.lineTo(px(x), py(terrain.heights[x] ?? 0));
    }
    p.lineTo(width, py(terrain.heights[terrain.width - 1] ?? 0));
    p.lineTo(width, height);
    p.close();
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, width, height]);

  /** The lit rim the design draws along the top of the playable ground. */
  const rimPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(0, py(terrain.heights[0] ?? 0));
    for (let x = 1; x < terrain.width; x++) {
      p.lineTo(px(x), py(terrain.heights[x] ?? 0));
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, width, height]);

  const arcPath = useMemo(() => {
    if (!trajectory || trajectory.length < 2) {
      return null;
    }
    const p = Skia.Path.Make();
    p.moveTo(px(trajectory[0]!.x), py(trajectory[0]!.y));
    for (let i = 1; i < trajectory.length; i++) {
      p.lineTo(px(trajectory[i]!.x), py(trajectory[i]!.y));
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trajectory, width, height]);

  /** Ridge paths are authored against the 328x340 box, so scale as a group. */
  const decor = useMemo(() => {
    const make = (d: string) => Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
    return {
      back: BACK_RIDGES.map(r => ({ ...r, path: closedRidge(make(r.path)) })),
      front: closedRidge(make(FRONT_RIDGE)),
    };
  }, []);

  // PanResponder is built once, so its handlers read the latest props through
  // refs instead of the ones captured on the first render.
  const dragger = draggableSide === null
    ? null
    : (tanks.find(t => t.side === draggableSide) ?? null);
  const draggerRef = useRef(dragger);
  draggerRef.current = dragger;
  const onAimAngleRef = useRef(onAimAngle);
  onAimAngleRef.current = onAimAngle;

  const pan = useRef(
    PanResponder.create({
      // Claiming the touch only when a barrel is grabbable leaves every other
      // drag to the horizontal ScrollView that pans the map.
      onStartShouldSetPanResponder: () => draggerRef.current !== null,
      onMoveShouldSetPanResponder: () => draggerRef.current !== null,
      // Once aiming has begun the ScrollView must not steal the gesture.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => aimAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: e => aimAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  /** Turn a touch inside the handle into an elevation off the muzzle. */
  function aimAt(locationX: number, locationY: number) {
    const t = draggerRef.current;
    if (!t) {
      return;
    }
    const dx = locationX - AIM_HANDLE / 2;
    // Screen y grows downward, so lifting the finger raises the barrel.
    const dy = AIM_HANDLE / 2 - locationY;
    const forward = t.side === SalvoSide.Left ? dx : -dx;
    const deg = (Math.atan2(dy, Math.max(forward, 0.001)) * 180) / Math.PI;
    onAimAngleRef.current(Math.round(clampAngle(deg)));
  }

  const dragMuzzle = dragger
    ? muzzleOf(terrain, {
        side: dragger.side,
        x: dragger.x,
        hp: dragger.hp,
        angle: dragger.angle,
        power: dragger.power,
      })
    : null;

  // Blasts tick from JS, like the shell flight, because Reanimated's
  // withTiming does not drive these Skia nodes in this app.
  const impactProgress = useBlastProgress(impactId, 620);
  const wreckProgress = useBlastProgress(destroyedSide, 1500);

  const wreck =
    destroyedSide === null ? null : (tanks.find(t => t.side === destroyedSide) ?? null);

  const aimer = aimingSide === null ? null : tanks.find(t => t.side === aimingSide);
  const guide = aimer
    ? aimGuide(terrain, {
        side: aimer.side,
        x: aimer.x,
        hp: aimer.hp,
        angle: aimer.angle,
        power: aimer.power,
      })
    : null;

  return (
    <View style={[styles.root, { width, height }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            positions={[0, 0.52, 1]}
            colors={[colors.salvoGround, colors.salvoSkyMid, colors.salvoSkyHorizon]}
          />
        </Rect>

        {STARS.map(s => (
          <Circle
            key={`${s.x}-${s.y}`}
            cx={px(s.x)}
            cy={s.y * sy}
            r={1.2}
            color={`rgba(233, 233, 237, ${s.o})`}
          />
        ))}

        {/* Parallax ridges, drawn in the design's own coordinate space. */}
        <Group transform={[{ scaleX: sx }, { scaleY: sy }]}>
          {decor.back.map(r => (
            <Path key={r.fill} path={r.path} color={r.fill} opacity={r.opacity} />
          ))}
        </Group>

        {/* Live, destructible ground. */}
        <Path path={groundPath} color={colors.salvoTerrain} />
        <Path
          path={rimPath}
          style="stroke"
          strokeWidth={1.6}
          color={colors.accent}
          opacity={0.75}
        />

        {/* Foreground ridge sits in front of the ground, per the design. */}
        <Group transform={[{ scaleX: sx }, { scaleY: sy }]}>
          <Path path={decor.front} color="#080910" opacity={0.55} />
        </Group>

        {arcPath && (
          <Path
            path={arcPath}
            style="stroke"
            strokeWidth={1.6}
            strokeCap="round"
            color={arcColor}
            opacity={trajectorySide === SalvoSide.Right ? 0.35 : 0.6}
          >
            <DashPathEffect intervals={[2, 7]} />
          </Path>
        )}

        {/* Grab ring: shows the barrel is draggable while aiming is live. */}
        {dragMuzzle && (
          <Circle
            cx={px(dragMuzzle.x)}
            cy={py(dragMuzzle.y)}
            r={18 * sx}
            style="stroke"
            strokeWidth={1.2}
            color={colors.accent}
            opacity={0.28}
          >
            <DashPathEffect intervals={[3, 5]} />
          </Circle>
        )}

        {/* Aim ticks marching out of the barrel of whoever is lining up. */}
        {guide?.map((p, i) => (
          <Circle
            key={i}
            cx={px(p.x)}
            cy={py(p.y)}
            r={(1.7 - i * 0.2) * sx}
            color={aimingSide === SalvoSide.Right ? colors.salvoEnemy : colors.accent}
            opacity={0.8 - i * 0.15}
          />
        ))}

        {impact && (
          <Group>
            <Circle
              cx={px(impact.x)}
              cy={py(impact.y)}
              r={13 * sx}
              style="stroke"
              strokeWidth={1.2}
              color={arcColor}
              opacity={0.5}
            />
            <Circle cx={px(impact.x)} cy={py(impact.y)} r={3 * sx} color={arcColor} />
          </Group>
        )}

        {/* Incoming ring around the tank under fire. */}
        {incomingOn !== null &&
          (() => {
            const t = tanks.find(s => s.side === incomingOn);
            if (!t) {
              return null;
            }
            return (
              <Circle
                cx={px(t.x)}
                cy={py(groundAt(terrain, t.x) + 10)}
                r={24 * sx}
                style="stroke"
                strokeWidth={1.5}
                color={colors.danger}
                opacity={0.45}
              />
            );
          })()}

        {/* Shell going off where it landed. */}
        {impact && impactProgress !== null && (
          <SalvoBlast
            cx={px(impact.x)}
            cy={py(impact.y)}
            radius={26 * sx}
            progress={impactProgress}
          />
        )}

        {/* The kill: a bigger, slower blast over the wreck. */}
        {wreck && wreckProgress !== null && (
          <SalvoBlast
            cx={px(wreck.x)}
            cy={py(groundAt(terrain, wreck.x) + 6)}
            radius={52 * sx}
            progress={wreckProgress}
          />
        )}

        {shell && (
          <Group>
            <Circle cx={px(shell.x)} cy={py(shell.y)} r={5 * sx} color={colors.gold} opacity={0.35} />
            <Circle cx={px(shell.x)} cy={py(shell.y)} r={2.8 * sx} color={colors.gold} />
          </Group>
        )}
      </Canvas>

      {tanks.map(t => (
        <SalvoTank
          key={t.side}
          side={t.side}
          x={px(t.x)}
          y={py(groundAt(terrain, t.x))}
          angle={t.angle}
          destroyed={t.hp <= 0}
          tilt={slopeAt(terrain, t.x)}
          scale={sx}
        />
      ))}

      {/* Drag anywhere in this patch around your own muzzle to set elevation. */}
      {dragMuzzle && (
        <View
          {...pan.panHandlers}
          style={[
            styles.aimHandle,
            {
              left: px(dragMuzzle.x) - AIM_HANDLE / 2,
              top: py(dragMuzzle.y) - AIM_HANDLE / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

/**
 * Run 0 -> 1 over `duration` whenever `key` changes to a new non-null value,
 * then hold at 1. Returns null while there is nothing to draw.
 */
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
      setProgress(p);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, duration]);

  return progress;
}

/** Close a ridge stroke down to the bottom of the design's 340-tall box. */
const closedRidge = (path: ReturnType<typeof Skia.Path.Make>) => {
  path.lineTo(SALVO_FIELD_WIDTH, SALVO_FIELD_HEIGHT);
  path.lineTo(0, SALVO_FIELD_HEIGHT);
  path.close();
  return path;
};

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  aimHandle: {
    position: 'absolute',
    width: AIM_HANDLE,
    height: AIM_HANDLE,
    borderRadius: AIM_HANDLE / 2,
  },
});
