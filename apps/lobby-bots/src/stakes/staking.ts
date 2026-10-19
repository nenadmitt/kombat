import {
  StakeAsset,
  type ApiClient,
  type GameRoomSummary,
} from '@gaming-platform/core';

import type { Config } from '../config';

export async function canAffordRoom(
  api: ApiClient,
  config: Config,
  room: GameRoomSummary,
): Promise<boolean> {
  if (room.stakeToken === null) return true;
  if (!config.stakesEnabled) return false;
  if (!config.stakeAssets.includes(room.stakeToken)) return false;

  const balances = await api.getStakePotBalances();
  const available = BigInt(balances.available[room.stakeToken] ?? '0');
  return available >= BigInt(room.stakeAmount ?? '0');
}

export function joinTokenFor(room: GameRoomSummary): StakeAsset | undefined {
  return room.stakeToken ?? undefined;
}
