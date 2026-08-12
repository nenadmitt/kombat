import {
  absoluteTrackIndex,
  HOME_PROGRESS,
  SAFE_TRACK_INDICES,
  TRACK_END,
  TRACK_LENGTH,
} from './ludo.board';
import {
  ABILITY_COST_HP,
  LAUNCH_DISTANCE,
  launchableTokens,
  launcherTarget,
  type LudoAbilityKind,
} from './ludo.abilities';
import {
  jumpDistance,
  jumpableTokens,
  teleportableTokens,
  type LudoJumps,
} from './ludo.jumps';
import { applyMove, legalMoves } from './ludo.rules';
import { shieldableTokens, type LudoShields } from './ludo.shields';
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
  jumped: readonly number[] = [],
  shields?: LudoShields,
): number | null {
  const moves = legalMoves(tokens, color, die, jumped);
  if (moves.length === 0) {
    return null;
  }

  let best: number = moves[0]!;
  let bestScore = -Infinity;
  for (const tokenIndex of moves) {
    const from = tokens[color]![tokenIndex]!;
    const result = applyMove(
      tokens,
      color,
      tokenIndex,
      jumpDistance(from, die, jumped.includes(tokenIndex)),
      shields,
    );

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

/** Every ability is cast on one of the caster's own pawns. */
export type LudoAbilityAction = {
  kind: LudoAbilityKind;
  tokenIndex: number;
};

export type LudoAbilityActionInput = {
  tokens: LudoTokens;
  color: LudoColor;
  opponents: LudoColor[];
  chargeHp: number;
  usesLeft: Record<LudoAbilityKind, number>;
  /** Buffed pawns of every color. */
  jumps?: LudoJumps;
  /** Shielded pawns of every color. */
  shields?: LudoShields;
};

/** How close behind an opponent has to be for the bot to jump clear. */
const LAUNCH_THREAT_CELLS = 12;

/** Only worth burning the one teleport on a pawn already most of the way round. */
const TELEPORT_TARGET_PROGRESS = 30;

/**
 * At most one ability per turn: launch a pawn the throw would bank or that
 * something is closing in on, shield the leading pawn, teleport one that is
 * nearly home, else buff the best candidate with Extra Jump.
 */
export function pickAbilityAction(
  input: LudoAbilityActionInput,
): LudoAbilityAction | null {
  const { tokens, color, opponents, chargeHp, usesLeft } = input;
  const jumps = input.jumps ?? {};
  const shields = input.shields ?? {};
  const affords = (kind: LudoAbilityKind): boolean =>
    (usesLeft[kind] ?? 0) > 0 && chargeHp >= ABILITY_COST_HP[kind];

  if (affords('launcher')) {
    const candidates = launchableTokens(tokens, color);
    const banked = candidates.find(
      i => launcherTarget(tokens[color]![i]!, LAUNCH_DISTANCE) === HOME_PROGRESS,
    );
    if (banked !== undefined) {
      return { kind: 'launcher', tokenIndex: banked };
    }
    const chased = candidates.filter(i =>
      isChased(tokens, color, tokens[color]![i]!, opponents),
    );
    const best = furthestToken(tokens, color, chased);
    if (best !== null) {
      return { kind: 'launcher', tokenIndex: best };
    }
  }

  if (affords('shield')) {
    const candidates = shieldableTokens(tokens, color, shields).filter(
      i => tokens[color]![i]! >= 0,
    );
    const best = furthestToken(tokens, color, candidates);
    if (best !== null) {
      return { kind: 'shield', tokenIndex: best };
    }
  }

  if (affords('teleport')) {
    const best = furthestToken(tokens, color, teleportableTokens(tokens, color));
    if (best !== null && tokens[color]![best]! >= TELEPORT_TARGET_PROGRESS) {
      return { kind: 'teleport', tokenIndex: best };
    }
  }

  if (affords('jump')) {
    const candidates = jumpableTokens(tokens, color, jumps).filter(i => {
      const progress = tokens[color]![i]!;
      return progress >= 0 && progress <= TRACK_END;
    });
    const chased = candidates.filter(i =>
      isChased(tokens, color, tokens[color]![i]!, opponents),
    );
    const best = furthestToken(
      tokens,
      color,
      chased.length > 0 ? chased : candidates,
    );
    if (best !== null) {
      return { kind: 'jump', tokenIndex: best };
    }
  }

  return null;
}

function furthestToken(
  tokens: LudoTokens,
  color: LudoColor,
  candidates: readonly number[],
): number | null {
  let best: number | null = null;
  for (const tokenIndex of candidates) {
    if (best === null || tokens[color]![tokenIndex]! > tokens[color]![best]!) {
      best = tokenIndex;
    }
  }
  return best;
}

function isChased(
  tokens: LudoTokens,
  color: LudoColor,
  progress: number,
  opponents: LudoColor[],
): boolean {
  const mine = absoluteTrackIndex(color, progress);
  return opponents.some(opponent =>
    (tokens[opponent] ?? []).some(other => {
      if (other < 0 || other > TRACK_END) {
        return false;
      }
      const gap = (mine - absoluteTrackIndex(opponent, other) + TRACK_LENGTH) % TRACK_LENGTH;
      return gap > 0 && gap < LAUNCH_THREAT_CELLS && other + gap <= TRACK_END;
    }),
  );
}
