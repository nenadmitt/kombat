import {
  absoluteTrackIndex,
  HOME_PROGRESS,
  SAFE_TRACK_INDICES,
  TRACK_END,
} from './ludo.board';
import { applyMove, legalMoves } from './ludo.rules';
import type { LudoColor, LudoTokens } from './ludo.types';

/**
 * Pick the bot's token for a rolled die, or null when nothing is movable.
 * Greedy one-ply heuristic: capture > finish a token > leave base > reach
 * a safe cell or the home column > push the furthest token. Shared by the
 * mobile demo (and any future server-side bot).
 */
export function chooseBotMove(
  tokens: LudoTokens,
  color: LudoColor,
  die: number,
): number | null {
  const moves = legalMoves(tokens, color, die);
  if (moves.length === 0) {
    return null;
  }

  let best: number = moves[0]!;
  let bestScore = -Infinity;
  for (const tokenIndex of moves) {
    const from = tokens[color]![tokenIndex]!;
    const result = applyMove(tokens, color, tokenIndex, die);

    let score = 0;
    if (result.captures.length > 0) {
      score += 100 * result.captures.length;
    }
    if (result.finished) {
      score += 80;
    }
    if (from === -1) {
      score += 50;
    }
    if (result.toProgress > TRACK_END && result.toProgress < HOME_PROGRESS) {
      score += 40;
    }
    if (
      result.toProgress <= TRACK_END &&
      SAFE_TRACK_INDICES.has(absoluteTrackIndex(color, result.toProgress))
    ) {
      score += 30;
    }
    // Prefer pushing the token closest to home; tiny jitter breaks ties so
    // the bot doesn't play identically every game.
    score += result.toProgress / 10 + Math.random();

    if (score > bestScore) {
      bestScore = score;
      best = tokenIndex;
    }
  }
  return best;
}
