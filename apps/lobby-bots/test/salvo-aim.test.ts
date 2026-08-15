import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSalvoTerrain,
  fireShot,
  SALVO_MAX_ANGLE,
  SALVO_MAX_POWER,
  SALVO_MIN_ANGLE,
  SALVO_MIN_POWER,
  SALVO_TANK_START_X,
  SalvoSide,
  type SalvoTank,
} from '@gaming-platform/core';

import { chooseAim } from '../src/drivers/salvo.driver';

const terrain = createSalvoTerrain(42);
const left: SalvoTank = {
  side: SalvoSide.Left,
  x: SALVO_TANK_START_X[SalvoSide.Left],
  hp: 100,
  angle: 45,
  power: 60,
};
const right: SalvoTank = {
  side: SalvoSide.Right,
  x: SALVO_TANK_START_X[SalvoSide.Right],
  hp: 100,
  angle: 45,
  power: 60,
};

test('the aim stays inside the dial limits', () => {
  for (let i = 0; i < 50; i++) {
    const aim = chooseAim(terrain, left, right, 0);
    assert.ok(aim.angle >= SALVO_MIN_ANGLE && aim.angle <= SALVO_MAX_ANGLE, `angle ${aim.angle}`);
    assert.ok(aim.power >= SALVO_MIN_POWER && aim.power <= SALVO_MAX_POWER, `power ${aim.power}`);
  }
});

test('the aim lands near the target, not somewhere random', () => {
  // Wobble is deliberate, so judge the median of many shots, not one.
  const misses: number[] = [];
  for (let i = 0; i < 40; i++) {
    const aim = chooseAim(terrain, left, right, 0);
    const shot = fireShot(terrain, { ...left, ...aim }, right, 0);
    misses.push(Math.abs(shot.impact.x - right.x));
  }
  misses.sort((a, b) => a - b);
  const median = misses[Math.floor(misses.length / 2)]!;
  assert.ok(median < 60, `median miss ${median}px is not aiming`);
});

test('the aim from the right side lands near the left tank too', () => {
  const misses: number[] = [];
  for (let i = 0; i < 40; i++) {
    const aim = chooseAim(terrain, right, left, 0);
    const shot = fireShot(terrain, { ...right, ...aim }, left, 0);
    misses.push(Math.abs(shot.impact.x - left.x));
  }
  misses.sort((a, b) => a - b);
  assert.ok(misses[Math.floor(misses.length / 2)]! < 60);
});

test('the search is cheap enough to run every turn', () => {
  const started = performance.now();
  for (let i = 0; i < 10; i++) chooseAim(terrain, left, right, 5);
  const perAim = (performance.now() - started) / 10;
  assert.ok(perAim < 50, `${perAim.toFixed(1)}ms per aim`);
});

// --- movement ---------------------------------------------------------------

import {
  SALVO_EDGE_MARGIN,
  SALVO_MIN_SEPARATION,
  SALVO_MOVE_RANGE,
  SALVO_FIELD_WIDTH,
} from '@gaming-platform/core';
import { chooseMove } from '../src/drivers/salvo.driver';

test('after a hit the bot moves away from where the shell landed', () => {
  // Shell landed just left of us: go right, the full budget.
  const to = chooseMove(left, right, left.x - 10);
  assert.ok(to !== null);
  assert.ok(to > left.x, `moved to ${to}, expected rightwards of ${left.x}`);
  assert.equal(Math.abs(to - left.x), SALVO_MOVE_RANGE);
});

test('a move never crosses the separation line', () => {
  // Left tank parked right up against the minimum separation: "away from a
  // shell on our left" would push into the opponent, so it must go the other way.
  const pinnedLeft: SalvoTank = { ...left, x: right.x - SALVO_MIN_SEPARATION };
  const to = chooseMove(pinnedLeft, right, pinnedLeft.x - 10);
  assert.ok(to !== null);
  assert.ok(to <= right.x - SALVO_MIN_SEPARATION, `moved to ${to}, inside separation`);
});

test('a move never drives off the field edge', () => {
  const atEdge: SalvoTank = { ...left, x: SALVO_EDGE_MARGIN };
  const to = chooseMove(atEdge, right, atEdge.x + 10); // shell to our right: "away" is left, off the edge
  assert.ok(to !== null);
  assert.ok(to >= SALVO_EDGE_MARGIN && to <= SALVO_FIELD_WIDTH - SALVO_EDGE_MARGIN);
  assert.ok(to > atEdge.x, 'should have flipped to the legal direction');
});

test('with no room to move at all the bot stays put rather than jittering', () => {
  // Boxed between the edge and the separation line with under 4px of play.
  const boxed: SalvoTank = { ...left, x: SALVO_EDGE_MARGIN };
  const closeRight: SalvoTank = { ...right, x: SALVO_EDGE_MARGIN + SALVO_MIN_SEPARATION + 2 };
  assert.equal(chooseMove(boxed, closeRight, null), null);
});
