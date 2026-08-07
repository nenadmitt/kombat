import { GameType } from '@gaming-platform/core';

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function initialOf(name: string | null | undefined): string {
  return (name?.trim().charAt(0) || '?').toUpperCase();
}

export const GAME_LABELS: Record<GameType, string> = {
  [GameType.NavalBattle]: 'Battleships',
  [GameType.Ludo]: 'Ludo Royale',
  [GameType.TripleCut]: 'Triple Cut',
  [GameType.ChromaClash]: 'Chroma Clash',
  [GameType.Salvo]: 'Salvo',
};

/** The arenas that have a web board behind them. */
export const WEB_PLAYABLE_GAMES: readonly GameType[] = [
  GameType.NavalBattle,
  GameType.Salvo,
  GameType.TripleCut,
];

export function isWebPlayable(gameType: GameType): boolean {
  return WEB_PLAYABLE_GAMES.includes(gameType);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
