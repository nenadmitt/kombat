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

/**
 * Terrain space. Height matches the design's battlefield viewBox so a renderer
 * only has to scale - never re-derive - the ridge, the tanks and a shell's arc.
 * The field is far wider than one screen: the duel is fought across a map you
 * scroll, with room either side of both tanks to drive into.
 */
export const SALVO_FIELD_WIDTH = 560;
export const SALVO_FIELD_HEIGHT = 340;
/** Hills keep this wavelength whatever the field width, so a wider map means
 *  more ridges rather than the same ridges stretched flat. */
const TERRAIN_PERIOD = 328;

/** Columns the two tanks start on, per the design's tank placement. Tanks
 *  move from here, so only the engine's live positions are authoritative. */
export const SALVO_TANK_START_X: Record<SalvoSide, number> = {
  [SalvoSide.Left]: 169,
  [SalvoSide.Right]: 391,
};

/**
 * How large a tank draws relative to the design's 40x24 sprite box. The hit
 * box and muzzle height below are set to match, so shrinking a hull here does
 * not quietly leave it easier or harder to hit than it looks.
 */
export const SALVO_TANK_SCALE = 0.75;

/** Terrain units a tank may drive per turn - one drive, then one shot. */
export const SALVO_MOVE_RANGE = 40;
/** Tanks may never close inside this, nor drive off the field edge. */
export const SALVO_MIN_SEPARATION = 90;
export const SALVO_EDGE_MARGIN = 22;

export const SALVO_MAX_HP = 100;

/** Aim limits. Angle is elevation above horizontal, power a 0-100 dial. */
export const SALVO_MIN_ANGLE = 5;
export const SALVO_MAX_ANGLE = 85;
export const SALVO_MIN_POWER = 0;
export const SALVO_MAX_POWER = 100;

/** Starting aim - the design's 38 degrees at 68 power. */
export const SALVO_START_ANGLE = 38;
export const SALVO_START_POWER = 68;

/** A player gets this long to fire before the shot is taken for them. */
export const SALVO_TURN_SECONDS = 20;

/** Wind is redrawn every round; the HUD shows it as a signed strength. */
export const SALVO_MAX_WIND = 10;

/** Tuned together so the design's opening aim - 38 degrees at 68 power - is
 *  very nearly the shot that crosses the ridge, leaving the dial's top half
 *  for high lobs and fighting the wind. */
const GRAVITY = 0.43;
/** Muzzle velocity per point of power. */
const POWER_SCALE = 0.135;
/** Horizontal acceleration per point of wind. */
const WIND_SCALE = 0.0055;

/** Integration step and the cap that stops a shell circling forever. */
const STEP = 0.25;
const MAX_STEPS = 8000;
/** Only every Nth step is kept, which is plenty to draw a smooth arc. */
const PATH_SAMPLE = 2;

/** How far above the terrain a tank's muzzle sits. Must clear TANK_HEIGHT or
 *  a shell detonates on its own hull the instant it leaves the barrel. */
const MUZZLE_HEIGHT = 15;
/** Half-width / height of a tank's hit box, in terrain units. Kept in step
 *  with SALVO_TANK_SCALE so the hull you see is the hull you hit. */
const TANK_HALF_WIDTH = 11;
const TANK_HEIGHT = 12;

/**
 * Damage tiers. A shell that actually strikes the hull hurts far more than
 * one that merely lands nearby, so aiming is worth something: previously any
 * impact within 7 units did full damage, which made a near miss identical to
 * a direct hit.
 */
/** Struck the hull within DIRECT_CORE of its centre. */
const DIRECT_DAMAGE = 38;
/** Struck the hull, but off-centre. */
const HULL_DAMAGE = 26;
/** Near miss: the most splash can do, tapering to 1 at the blast rim. */
const SPLASH_MAX_DAMAGE = 16;
/** How close to the hull's centre a strike must be to count as direct. */
const DIRECT_CORE = 6;
/** Splash reaches this far from the hull's centre. */
const BLAST_RADIUS = 30;

/** Craters are a circular bite centred on the impact. Sized so the earth
 *  moved matches the old parabolic notch - same volume, better shape - and
 *  a full match does not scrape the map flat. */
const CRATER_RADIUS = 14;

/** Terrain stays inside this band so neither tank is ever buried or airborne. */
const MIN_GROUND = 42;
const MAX_GROUND = 118;

/** Mulberry32 - deterministic, so a seed fully describes a battlefield. */
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

/**
 * Build a battlefield from a seed: three sine octaves over a flat base give
 * the design's rolling ridge. Tanks rest on whatever column they occupy, so
 * the ground is never flattened for them.
 */
export const createSalvoTerrain = (seed: number): SalvoTerrain => {
  const rand = rngFromSeed(seed);
  // Amplitudes stay modest so the ridge rolls like the design's rather than
  // throwing up walls that make half the power dial unusable.
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

/**
 * How steeply the ground runs under a hull, in degrees, positive when it
 * climbs to the right. Renderers tilt a tank by this so it sits on the
 * contour instead of floating flat over it.
 */
export const slopeAt = (terrain: SalvoTerrain, x: number): number => {
  const left = groundAt(terrain, x - TANK_HALF_WIDTH);
  const right = groundAt(terrain, x + TANK_HALF_WIDTH);
  const deg = (Math.atan2(right - left, TANK_HALF_WIDTH * 2) * 180) / Math.PI;
  return clamp(deg, -SALVO_MAX_TILT, SALVO_MAX_TILT);
};

/** Tanks never lean further than this, however sharp the ground gets. */
export const SALVO_MAX_TILT = 17;

const clampIndex = (x: number, terrain: SalvoTerrain): number =>
  Math.min(terrain.width - 1, Math.max(0, Math.round(x)));

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clampAngle = (angle: number): number =>
  clamp(angle, SALVO_MIN_ANGLE, SALVO_MAX_ANGLE);

export const clampPower = (power: number): number =>
  clamp(power, SALVO_MIN_POWER, SALVO_MAX_POWER);

/**
 * Where a tank ends up driving `dx` from `x`, held inside the field and never
 * closing inside SALVO_MIN_SEPARATION of the other tank. Returns the reachable
 * column, so the caller can bill the distance actually travelled.
 */
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

/**
 * A few points marching out of the barrel along the current aim, for the
 * "someone is lining up a shot" tick marks. Length grows with power, so the
 * guide reads the dial without giving the landing point away.
 */
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

/**
 * Draw the round's wind: a signed strength, positive blowing rightwards.
 * Takes its randomness so the server can supply a crypto-backed source and
 * remain the only authority on it.
 */
export const rollWind = (rand: () => number = Math.random): number =>
  Math.round((rand() * 2 - 1) * SALVO_MAX_WIND);

/** Where a tank's shell leaves the barrel. */
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

/**
 * Fly one shell and resolve it. Pure: the caller owns applying the damage and
 * the crater, so the same call can preview a shot or commit it.
 */
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
  // Which hull the shell actually struck, if any - a strike is worth far more
  // than the same distance measured as splash.
  let struckTarget = false;
  let struckShooter = false;
  // A shell only arms against its own tank once it has cleared it, so a steep
  // lob that falls back on the shooter still counts while a launch never does.
  let armed = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    vx += ax * STEP;
    vy -= GRAVITY * STEP;
    x += vx * STEP;
    y += vy * STEP;

    if (step % PATH_SAMPLE === 0) {
      path.push({ x, y });
    }

    // A shell still climbing is allowed off the top of the field, but it can
    // never come back from off the sides.
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

/** Damage a blast at `impact` does to `tank`, tapering to 0 at the rim. */
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

  // Splash is measured from the hull's edge, not its centre, so a shell that
  // lands just short of the tracks still stings.
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

/**
 * Carve the crater a shell leaves, mutating `heights` in place. Only terrain
 * impacts call this: a shell that finds a hull detonates on armour, so the
 * ground under a hit tank is left intact.
 */
export const carveCrater = (terrain: SalvoTerrain, impact: SalvoPoint): void => {
  const r = CRATER_RADIUS;
  for (let x = Math.floor(impact.x - r); x <= Math.ceil(impact.x + r); x++) {
    const dx = x - impact.x;
    if (Math.abs(dx) > r) {
      continue;
    }
    // Take a true circular bite centred on the impact: at this column the
    // new surface is the bottom of that circle, wherever the ground already
    // sits lower. A heightmap holds one surface per column, so the circle's
    // deepest point at each column is what the ground becomes.
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

/** Hits as a percentage of shots, rounded - 0 before the first shot. */
export const salvoAccuracy = (stats: SalvoPlayerStats): number =>
  stats.shots === 0 ? 0 : Math.round((stats.hits / stats.shots) * 100);

/**
 * Pick the bot's aim: grid-search the shot that lands nearest the target, then
 * spread it by `spread` terrain units so it misses like a person does.
 */
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

  // Nudging power alone moves the landing point roughly along the ridge, which
  // keeps the miss readable as "short" or "long" rather than randomly wild.
  const jitter = (Math.random() * 2 - 1) * spread;
  return {
    angle: clampAngle(best.angle + (Math.random() * 2 - 1) * 2),
    power: clampPower(best.power + jitter),
  };
};
