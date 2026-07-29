/**
 * @gaming-platform/core
 *
 * Platform-agnostic shared layer (no react-native / DOM imports), so the same
 * code can be consumed by the mobile app today and a web app later.
 *
 * Example shared constant:
 */
export const APP_NAME = 'Gaming Platform';

export * from './api/api-client';
export * from './api/error-codes';
export * from './authentication/authentication.types';
export * from './games/game-room.types';
export * from './games/turn-based';
export * from './games/battleship';
export * from './games/chroma';
export * from './games/ludo';
export * from './games/rps';
export * from './games/salvo';
export * from './games/stake.types';
export * from './platform/platform-status';
export * from './wallets/wallet.types';
