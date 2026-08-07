import {
  SALVO_FIELD_HEIGHT,
  SALVO_FIELD_WIDTH,
} from '@gaming-platform/core';

export { SALVO_FIELD_HEIGHT, SALVO_FIELD_WIDTH };

/**
 * The battlefield's own palette, from the mobile app. Two of these already
 * exist as app tokens; the rest are specific to this arena.
 */
export const SKY_TOP = 'var(--app)';
export const SKY_MID = '#101526';
export const SKY_HORIZON = '#202f2d';
export const TERRAIN_FILL = '#202e1f';
export const ENEMY_BODY = '#cdcfd8';
export const ENEMY_TREAD = '#7d808c';
export const WRECK = '#4a4d59';
export const MY_TREAD = '#4e7b31';

/**
 * The design's parallax ridges, authored against its 328x340 box. Copied
 * verbatim - they are already SVG path data on mobile too.
 */
export const BACK_RIDGES = [
  {
    path: 'M0,116 C44,96 84,126 132,108 C182,90 220,120 268,104 C296,95 314,110 328,102',
    fill: '#0e1220',
    opacity: 0.5,
  },
  {
    path: 'M0,164 C40,148 78,176 126,160 C176,143 214,170 262,156 C294,147 312,162 328,154',
    fill: '#0c1019',
    opacity: 0.6,
  },
];

export const FRONT_RIDGE =
  'M0,308 C40,300 70,316 108,312 C150,308 172,286 210,296 C254,308 290,318 328,310';

/** The box the ridge paths were drawn in, so they can be scaled onto the field. */
export const RIDGE_WIDTH = 328;
export const RIDGE_HEIGHT = 340;

/** Static star field, matching the three specks in the design. */
export const STARS = [
  { x: 44, y: 34, o: 0.45 },
  { x: 206, y: 22, o: 0.3 },
  { x: 268, y: 58, o: 0.38 },
];

/**
 * A ridge stroke closed into a silhouette. It closes at the field's full
 * width, not the 328 the curve spans, so the far side runs out to the corner
 * exactly as it does on mobile.
 */
export function closedRidge(path: string): string {
  return `${path} L${SALVO_FIELD_WIDTH},${SALVO_FIELD_HEIGHT} L0,${SALVO_FIELD_HEIGHT} Z`;
}

/**
 * Terrain to an SVG path. Gameplay scales uniformly by the horizontal factor:
 * y is mirrored with `sx`, not `sy`, or a 45 degree barrel would not throw a
 * 45 degree arc.
 */
export function terrainPath(heights: number[], sx: number, height: number): string {
  const parts: string[] = [`M0,${height}`];
  for (let x = 0; x < heights.length; x += 2) {
    parts.push(`L${x * sx},${height - (heights[x] ?? 0) * sx}`);
  }
  const lastX = heights.length - 1;
  parts.push(`L${lastX * sx},${height - (heights[lastX] ?? 0) * sx}`);
  parts.push(`L${lastX * sx},${height}`);
  parts.push('Z');
  return parts.join(' ');
}

/** The same surface as a stroked line, for the lit rim along the top. */
export function terrainRim(heights: number[], sx: number, height: number): string {
  const parts: string[] = [];
  for (let x = 0; x < heights.length; x += 2) {
    parts.push(
      `${x === 0 ? 'M' : 'L'}${x * sx},${height - (heights[x] ?? 0) * sx}`,
    );
  }
  return parts.join(' ');
}

/** Sampled trajectory to a polyline. */
export function pathLine(
  points: { x: number; y: number }[],
  sx: number,
  height: number,
): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * sx},${height - p.y * sx}`)
    .join(' ');
}
