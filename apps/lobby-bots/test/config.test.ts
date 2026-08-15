import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GameType } from '@gaming-platform/core';

import { parseGameMix } from '../src/config';

test('parses a weighted mix', () => {
  assert.deepEqual(parseGameMix('NavalBattle:0.6,Ludo:0.4'), [
    { gameType: GameType.NavalBattle, weight: 0.6 },
    { gameType: GameType.Ludo, weight: 0.4 },
  ]);
});

test('a game with no driver is refused rather than silently skipped', () => {
  assert.throws(() => parseGameMix('ChromaClash:1'), /No driver/);
});

test('an unknown game name is refused', () => {
  assert.throws(() => parseGameMix('Backgammon:1'), /Unknown game type/);
});

test('an empty mix is refused', () => {
  assert.throws(() => parseGameMix(''), /empty/);
});
