// GameType, GameRoomStatus, StakeAsset and EscrowStatus are shared with the
// mobile client — defined once in @gaming-platform/core, re-exported here so
// server imports (`from '../db/types/game'`) don't need to change if that
// ever moves.
export {
  GameType,
  GameRoomStatus,
  StakeAsset,
  EscrowStatus,
} from '@gaming-platform/core';
