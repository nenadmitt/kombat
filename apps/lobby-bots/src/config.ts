import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { GameType, StakeAsset } from '@gaming-platform/core';

export type AuthMode = 'test-otp' | 'siwe';

export type Config = {
  serverUrl: string;
  botCount: number;
  authMode: AuthMode;
  adminToken: string | null;
  joinDelayMs: Range;
  minOpenRooms: number;
  maxHostedRooms: number;
  hostedRoomTtlMs: Range;
  gameMix: { gameType: GameType; weight: number }[];
  stakesEnabled: boolean;
  stakeAssets: StakeAsset[];
  pacing: {
    battleshipSetupMs: Range;
    battleshipShotMs: Range;
    ludoRollMs: Range;
    ludoMoveMs: Range;
  };
  logLevel: 'debug' | 'info';
};

export type Range = { min: number; max: number };

/** Games the runner has a driver for; anything else is ignored in the lobby. */
export const DRIVEABLE_GAMES: GameType[] = [GameType.NavalBattle, GameType.Ludo];

const ENV_FILE = join(__dirname, '..', '.env');

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a number, got "${raw}"`);
  }
  return parsed;
}

function range(key: string, min: number, max: number): Range {
  const lo = num(`${key}_MIN`, min);
  const hi = num(`${key}_MAX`, max);
  if (lo > hi) {
    throw new Error(`${key}_MIN (${lo}) must not exceed ${key}_MAX (${hi})`);
  }
  return { min: lo, max: hi };
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** `NavalBattle:0.6,Ludo:0.4` - weights need not sum to 1. */
export function parseGameMix(raw: string): { gameType: GameType; weight: number }[] {
  const mix = raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, weight] = part.split(':');
      const gameType = GameType[name?.trim() as keyof typeof GameType];
      if (typeof gameType !== 'number') {
        throw new Error(`Unknown game type "${name}" in BOTS_GAME_MIX`);
      }
      if (!DRIVEABLE_GAMES.includes(gameType)) {
        throw new Error(`No driver for "${name}" in BOTS_GAME_MIX`);
      }
      const parsed = Number(weight ?? '1');
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Weight for "${name}" must be a positive number`);
      }
      return { gameType, weight: parsed };
    });
  if (mix.length === 0) {
    throw new Error('BOTS_GAME_MIX is empty');
  }
  return mix;
}

function parseStakeAssets(raw: string): StakeAsset[] {
  return raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(name => {
      const asset = StakeAsset[name as keyof typeof StakeAsset];
      // Native is the gas asset, never stakeable.
      if (typeof asset !== 'number' || asset === StakeAsset.Native) {
        throw new Error(`"${name}" is not a stakeable asset`);
      }
      return asset;
    });
}

export function loadConfig(): Config {
  if (existsSync(ENV_FILE)) {
    process.loadEnvFile(ENV_FILE);
  }

  const authMode = (process.env.BOTS_AUTH_MODE ?? 'test-otp') as AuthMode;
  if (authMode !== 'test-otp' && authMode !== 'siwe') {
    throw new Error(`BOTS_AUTH_MODE must be test-otp or siwe, got "${authMode}"`);
  }

  const adminToken = process.env.BOTS_ADMIN_TOKEN?.trim() || null;

  return {
    serverUrl: (process.env.BOTS_SERVER_URL ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    ),
    botCount: num('BOTS_COUNT', 10),
    authMode,
    adminToken,
    joinDelayMs: range('BOTS_JOIN_DELAY_MS', 20_000, 30_000),
    minOpenRooms: num('BOTS_MIN_OPEN_ROOMS', 4),
    maxHostedRooms: num('BOTS_MAX_HOSTED_ROOMS', 4),
    hostedRoomTtlMs: range('BOTS_HOSTED_ROOM_TTL_MS', 180_000, 480_000),
    gameMix: parseGameMix(
      process.env.BOTS_GAME_MIX ?? 'NavalBattle:0.6,Ludo:0.4',
    ),
    stakesEnabled: bool('BOTS_STAKES_ENABLED', true),
    stakeAssets: parseStakeAssets(process.env.BOTS_STAKE_ASSETS ?? 'Kombat'),
    pacing: {
      battleshipSetupMs: range('BOTS_BSHIP_SETUP_MS', 5_000, 15_000),
      battleshipShotMs: range('BOTS_BSHIP_SHOT_MS', 2_500, 6_000),
      ludoRollMs: range('BOTS_LUDO_ROLL_MS', 1_300, 3_000),
      ludoMoveMs: range('BOTS_LUDO_MOVE_MS', 900, 2_500),
    },
    logLevel: process.env.BOTS_LOG_LEVEL === 'debug' ? 'debug' : 'info',
  };
}
