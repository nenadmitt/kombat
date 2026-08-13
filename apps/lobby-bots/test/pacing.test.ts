import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEADLINE_MARGIN_MS, pauseFor } from '../src/bot/pacing';

const RANGE = { min: 2_000, max: 6_000 };

test('a pause never eats into the deadline margin', () => {
  const now = 1_000_000;
  for (let offset = 0; offset <= 40_000; offset += 250) {
    const paused = pauseFor(RANGE, now + offset, now);
    assert.ok(
      paused <= Math.max(0, offset - DEADLINE_MARGIN_MS),
      `pause ${paused} too long for a deadline ${offset}ms away`,
    );
  }
});

test('a deadline inside the margin means no pause at all', () => {
  const now = 1_000_000;
  assert.equal(pauseFor(RANGE, now + DEADLINE_MARGIN_MS, now), 0);
  assert.equal(pauseFor(RANGE, now, now), 0);
  assert.equal(pauseFor(RANGE, now - 5_000, now), 0);
});

test('with no deadline the pause stays inside its range', () => {
  for (let i = 0; i < 100; i++) {
    const paused = pauseFor(RANGE, null);
    assert.ok(paused >= RANGE.min && paused <= RANGE.max);
  }
});
