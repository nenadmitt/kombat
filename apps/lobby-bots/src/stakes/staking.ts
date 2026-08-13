import {
  StakeAsset,
  type ApiClient,
  type GameRoomSummary,
} from '@gaming-platform/core';

import type { Config } from '../config';

/**
 * Whether a bot may join this room's stake. Bots stake only the assets in
 * BOTS_STAKE_ASSETS (KOMBAT by default) and only out of settled pot balance,
 * so a bot can never enter a match it cannot cover.
 */
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

/** The asset a bot joins with; it never converts across assets. */
export function joinTokenFor(room: GameRoomSummary): StakeAsset | undefined {
  return room.stakeToken ?? undefined;
}
