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
