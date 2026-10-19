import { SalvoSide } from './salvo.types';
import type {
  SalvoDamageKind,
  SalvoImpactKind,
  SalvoPlayerStats,
  SalvoPoint,
  SalvoShot,
  SalvoTank,
  SalvoTerrain,
} from './salvo.types';

/** Height matches the design's battlefield viewBox, so renderers only scale. */
export const SALVO_FIELD_WIDTH = 560;
export const SALVO_FIELD_HEIGHT = 340;
/** Fixed wavelength: a wider map means more ridges, not stretched ones. */
const TERRAIN_PERIOD = 328;

export const SALVO_TANK_START_X: Record<SalvoSide, number> = {
  [SalvoSide.Left]: 169,
  [SalvoSide.Right]: 391,
};

/** The hit box and muzzle height below are tuned to match this scale. */
export const SALVO_TANK_SCALE = 0.75;

export const SALVO_MOVE_RANGE = 40;
export const SALVO_MIN_SEPARATION = 90;
export const SALVO_EDGE_MARGIN = 22;

export const SALVO_MAX_HP = 100;

export const SALVO_MIN_ANGLE = 5;
export const SALVO_MAX_ANGLE = 85;
export const SALVO_MIN_POWER = 0;
export const SALVO_MAX_POWER = 100;

export const SALVO_START_ANGLE = 38;
export const SALVO_START_POWER = 68;

export const SALVO_TURN_SECONDS = 20;

export const SALVO_MAX_WIND = 10;

/** Tuned together so the opening aim very nearly crosses the ridge. */
const GRAVITY = 0.43;
const POWER_SCALE = 0.135;
const WIND_SCALE = 0.0055;

const STEP = 0.25;
const MAX_STEPS = 8000;
const PATH_SAMPLE = 2;

/** Must clear TANK_HEIGHT or a shell detonates on its own hull. */
const MUZZLE_HEIGHT = 15;
const TANK_HALF_WIDTH = 11;
const TANK_HEIGHT = 12;

const DIRECT_DAMAGE = 38;
const HULL_DAMAGE = 26;
const SPLASH_MAX_DAMAGE = 16;
const DIRECT_CORE = 6;
const BLAST_RADIUS = 30;

const CRATER_RADIUS = 14;

const MIN_GROUND = 42;
const MAX_GROUND = 118;

/** Mulberry32: deterministic, so a seed fully describes a battlefield. */
const rngFromSeed = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomSalvoSeed = (): number =>
  Math.floor(Math.random() * 0xffffffff);

export const createSalvoTerrain = (seed: number): SalvoTerrain => {
  const rand = rngFromSeed(seed);
  // Modest amplitudes keep the whole power dial usable.
  const base = 58 + rand() * 18;
  const octaves = [
    { amp: 10 + rand() * 8, freq: 1 + rand() * 0.6, phase: rand() * Math.PI * 2 },
    { amp: 6 + rand() * 5, freq: 2.2 + rand() * 1.2, phase: rand() * Math.PI * 2 },
    { amp: 2.5 + rand() * 2.5, freq: 4.5 + rand() * 2, phase: rand() * Math.PI * 2 },
  ];

  const heights = new Array<number>(SALVO_FIELD_WIDTH);
  for (let x = 0; x < SALVO_FIELD_WIDTH; x++) {
    const t = (x / TERRAIN_PERIOD) * Math.PI * 2;
    let h = base;
    for (const o of octaves) {
      h += Math.sin(t * o.freq + o.phase) * o.amp;
    }
    heights[x] = clamp(h, MIN_GROUND, MAX_GROUND);
  }

  return { width: SALVO_FIELD_WIDTH, height: SALVO_FIELD_HEIGHT, heights };
};

export const groundAt = (terrain: SalvoTerrain, x: number): number =>
  terrain.heights[clampIndex(x, terrain)] ?? 0;

/** Degrees, positive when the ground climbs to the right. */
export const slopeAt = (terrain: SalvoTerrain, x: number): number => {
  const left = groundAt(terrain, x - TANK_HALF_WIDTH);
  const right = groundAt(terrain, x + TANK_HALF_WIDTH);
  const deg = (Math.atan2(right - left, TANK_HALF_WIDTH * 2) * 180) / Math.PI;
  return clamp(deg, -SALVO_MAX_TILT, SALVO_MAX_TILT);
};

export const SALVO_MAX_TILT = 17;

const clampIndex = (x: number, terrain: SalvoTerrain): number =>
  Math.min(terrain.width - 1, Math.max(0, Math.round(x)));

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampAngle = (angle: number): number =>
  clamp(angle, SALVO_MIN_ANGLE, SALVO_MAX_ANGLE);

export const clampPower = (power: number): number =>
  clamp(power, SALVO_MIN_POWER, SALVO_MAX_POWER);

export const clampTankX = (
  x: number,
  dx: number,
  side: SalvoSide,
  otherX: number,
): number => {
  const wanted = x + dx;
  const lo =
    side === SalvoSide.Left
      ? SALVO_EDGE_MARGIN
      : Math.max(SALVO_EDGE_MARGIN, otherX + SALVO_MIN_SEPARATION);
  const hi =
    side === SalvoSide.Left
      ? Math.min(SALVO_FIELD_WIDTH - SALVO_EDGE_MARGIN, otherX - SALVO_MIN_SEPARATION)
      : SALVO_FIELD_WIDTH - SALVO_EDGE_MARGIN;
  return clamp(wanted, Math.min(lo, hi), Math.max(lo, hi));
};

/** Length grows with power without giving the landing point away. */
export const aimGuide = (
  terrain: SalvoTerrain,
  tank: SalvoTank,
  ticks = 4,
): SalvoPoint[] => {
  const dir = tank.side === SalvoSide.Left ? 1 : -1;
  const rad = (tank.angle * Math.PI) / 180;
  const start = muzzleOf(terrain, tank);
  const reach = 16 + (tank.power / SALVO_MAX_POWER) * 34;
  return Array.from({ length: ticks }, (_, i) => {
    const d = reach * ((i + 1) / ticks);
    return {
      x: start.x + Math.cos(rad) * d * dir,
      y: start.y + Math.sin(rad) * d,
    };
  });
};

/** Positive blows rightwards; randomness is injected so the server stays the authority. */
export const rollWind = (rand: () => number = Math.random): number =>
  Math.round((rand() * 2 - 1) * SALVO_MAX_WIND);

export const muzzleOf = (terrain: SalvoTerrain, tank: SalvoTank): SalvoPoint => ({
  x: tank.x,
  y: groundAt(terrain, tank.x) + MUZZLE_HEIGHT,
});

const hitsTank = (p: SalvoPoint, terrain: SalvoTerrain, tank: SalvoTank): boolean => {
  const base = groundAt(terrain, tank.x);
  return (
    Math.abs(p.x - tank.x) <= TANK_HALF_WIDTH &&
    p.y >= base &&
    p.y <= base + TANK_HEIGHT
  );
};

export const fireShot = (
  terrain: SalvoTerrain,
  shooter: SalvoTank,
  target: SalvoTank,
  wind: number,
): SalvoShot => {
  const dir = shooter.side === SalvoSide.Left ? 1 : -1;
  const rad = (shooter.angle * Math.PI) / 180;
  const speed = shooter.power * POWER_SCALE;

  let vx = Math.cos(rad) * speed * dir;
  let vy = Math.sin(rad) * speed;
  const ax = wind * WIND_SCALE;

  const start = muzzleOf(terrain, shooter);
  let x = start.x;
  let y = start.y;

  const path: SalvoPoint[] = [{ x, y }];
  let kind: SalvoImpactKind = 'out-of-bounds';
  let struckTarget = false;
  let struckShooter = false;
  // Arms against its own tank only once clear: a falling lob can self-hit, a launch never does.
  let armed = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    vx += ax * STEP;
    vy -= GRAVITY * STEP;
    x += vx * STEP;
    y += vy * STEP;

    if (step % PATH_SAMPLE === 0) {
      path.push({ x, y });
    }

    // A climbing shell may leave the top of the field but never returns from the sides.
    if (x < 0 || x > terrain.width) {
      kind = 'out-of-bounds';
      break;
    }
    const onShooter = hitsTank({ x, y }, terrain, shooter);
    armed = armed || !onShooter;
    const onTarget = hitsTank({ x, y }, terrain, target);
    if (onTarget || (armed && onShooter)) {
      kind = 'tank';
      struckTarget = onTarget;
      struckShooter = armed && onShooter;
      break;
    }
    if (y <= groundAt(terrain, x)) {
      kind = 'terrain';
      break;
    }
  }

  const impact = { x, y };
  path.push(impact);

  const spent = kind === 'out-of-bounds';
  const onTarget = spent
    ? { damage: 0, kind: 'none' as SalvoDamageKind }
    : blastDamage(terrain, impact, target, struckTarget);
  const onSelf = spent
    ? { damage: 0, kind: 'none' as SalvoDamageKind }
    : blastDamage(terrain, impact, shooter, struckShooter);
  return {
    shooter: shooter.side,
    path,
    impact,
    kind,
    damage: onTarget.damage,
    damageKind: onTarget.kind,
    selfDamage: onSelf.damage,
    hit: onTarget.damage > 0,
  };
};

export const blastDamage = (
  terrain: SalvoTerrain,
  impact: SalvoPoint,
  tank: SalvoTank,
  struckHull = false,
): { damage: number; kind: SalvoDamageKind } => {
  const centre = { x: tank.x, y: groundAt(terrain, tank.x) + TANK_HEIGHT / 2 };
  const d = Math.hypot(impact.x - centre.x, impact.y - centre.y);

  if (struckHull) {
    return d <= DIRECT_CORE
      ? { damage: DIRECT_DAMAGE, kind: 'direct' }
      : { damage: HULL_DAMAGE, kind: 'hull' };
  }

  // Measured from the hull's edge so a shell just short of the tracks still stings.
  const fromHull = Math.max(0, d - TANK_HALF_WIDTH);
  const reach = BLAST_RADIUS - TANK_HALF_WIDTH;
  if (fromHull >= reach) {
    return { damage: 0, kind: 'none' };
  }
  const damage = Math.max(
    1,
    Math.round(SPLASH_MAX_DAMAGE * (1 - fromHull / reach)),
  );
  return { damage, kind: 'splash' };
};

/** Mutates `heights`. Only terrain impacts crater; a hull hit leaves the ground intact. */
export const carveCrater = (terrain: SalvoTerrain, impact: SalvoPoint): void => {
  const r = CRATER_RADIUS;
  for (let x = Math.floor(impact.x - r); x <= Math.ceil(impact.x + r); x++) {
    const dx = x - impact.x;
    if (Math.abs(dx) > r) {
      continue;
    }
    const i = clampIndex(x, terrain);
    const floor = impact.y - Math.sqrt(r * r - dx * dx);
    const current = terrain.heights[i] ?? 0;
    terrain.heights[i] = Math.max(MIN_GROUND, Math.min(current, floor));
  }
};

export const emptySalvoStats = (): SalvoPlayerStats => ({
  shots: 0,
  hits: 0,
  bestHit: 0,
  damageByRound: [],
});

export const salvoAccuracy = (stats: SalvoPlayerStats): number =>
  stats.shots === 0 ? 0 : Math.round((stats.hits / stats.shots) * 100);

export const chooseBotAim = (
  terrain: SalvoTerrain,
  bot: SalvoTank,
  target: SalvoTank,
  wind: number,
  spread: number,
): { angle: number; power: number } => {
  let best = { angle: SALVO_START_ANGLE, power: SALVO_START_POWER };
  let bestMiss = Infinity;

  for (let angle = 20; angle <= 70; angle += 5) {
    for (let power = 35; power <= SALVO_MAX_POWER; power += 5) {
      const shot = fireShot(terrain, { ...bot, angle, power }, target, wind);
      if (shot.kind === 'out-of-bounds' || shot.selfDamage > 0) {
        continue;
      }
      const miss = Math.abs(shot.impact.x - target.x);
      if (miss < bestMiss) {
        bestMiss = miss;
        best = { angle, power };
      }
    }
  }

  // Jittering power alone keeps the miss readable as "short" or "long".
  const jitter = (Math.random() * 2 - 1) * spread;
  return {
    angle: clampAngle(best.angle + (Math.random() * 2 - 1) * 2),
    power: clampPower(best.power + jitter),
  };
};
