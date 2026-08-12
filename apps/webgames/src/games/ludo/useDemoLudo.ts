import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ABILITY_COST_HP,
  DIE_SIDES,
  HOME_PROGRESS,
  LAUNCH_DISTANCE,
  LUDO_COLORS,
  MAX_CONSECUTIVE_SIXES,
  MAX_TIMEOUTS,
  TELEPORT_TO,
  TURN_SECONDS,
  addChargeHp,
  addJump,
  addShield,
  allTokensHome,
  applyMove,
  chargeHpForRoll,
  chooseBotMove,
  freshAbilityUses,
  hasJump,
  initialTokens,
  jumpDistance,
  jumpableTokens,
  jumpsFor,
  moveBonusHp,
  launchableTokens,
  launcherTarget,
  legalMoves,
  nextColorInPlay,
  pickAbilityAction,
  shieldableTokens,
  teleportableTokens,
  type LudoAbilityAction,
  type LudoAbilityKind,
  type LudoColor,
  type LudoEndReason,
  type LudoJumps,
  type LudoShields,
  type LudoStage,
  type LudoTokens,
} from '@gaming-platform/core';

import { LUDO_COLOR_NAMES } from './ludo-theme';
import {
  type LudoEngine,
  type LudoSeatView,
} from './ludo-engine';

/** Demo table: the player is red, three bots fill the other seats. */
const BOT_NAMES: Record<LudoColor, string> = {
  red: 'You',
  green: 'Milo',
  yellow: 'Ava',
  blue: 'Rex',
};
const MY_COLOR: LudoColor = 'red';
const SEAT_COLORS = [...LUDO_COLORS];

// Bot pacing: slow enough that each roll (and its ~550ms dice animation) is
// readable before the bot picks a pawn, and turns don't blur together.
const BOT_ROLL_DELAY_MS = 1700;
const BOT_MOVE_DELAY_MS = 1300;
/** Beat between a bot casting an ability and the action it was going to take. */
const BOT_ABILITY_PAUSE_MS = 1100;

type DemoState = {
  tokens: LudoTokens;
  turnColor: LudoColor;
  stage: LudoStage;
  die: number | null;
  /** Bumps on every roll so the die animates even for repeated values. */
  rollId: number;
  sixChain: number;
  movable: number[];
  notice: string | null;
  winner: LudoColor | null;
  myTimeouts: number;
  turnStartedAt: number;
  /** Charge in half-points per seat; bots spend from the same economy. */
  chargeHp: Record<LudoColor, number>;
  abilityUses: Record<LudoColor, Record<LudoAbilityKind, number>>;
  jumps: LudoJumps;
  shields: LudoShields;
};

const byColor = <T,>(make: () => T): Record<LudoColor, T> =>
  Object.fromEntries(SEAT_COLORS.map(color => [color, make()])) as Record<
    LudoColor,
    T
  >;

const creditMove = (
  state: Pick<DemoState, 'turnColor' | 'chargeHp'>,
  tokenIndex: number,
  tokens: LudoTokens,
  captureCount: number,
): DemoState['chargeHp'] => {
  const bonus = moveBonusHp(
    state.turnColor,
    (tokens[state.turnColor] ?? [])[tokenIndex]!,
    captureCount,
  );
  return bonus === 0
    ? state.chargeHp
    : {
        ...state.chargeHp,
        [state.turnColor]: addChargeHp(state.chargeHp[state.turnColor], bonus),
      };
};

const freshState = (): DemoState => ({
  tokens: initialTokens(SEAT_COLORS),
  turnColor: MY_COLOR,
  stage: 'roll',
  die: null,
  rollId: 0,
  sixChain: 0,
  movable: [],
  notice: null,
  winner: null,
  myTimeouts: 0,
  turnStartedAt: Date.now(),
  chargeHp: byColor(() => 0),
  abilityUses: byColor(freshAbilityUses),
  jumps: {},
  shields: {},
});

const rollDie = () => 1 + Math.floor(Math.random() * DIE_SIDES);

/**
 * Single-player demo engine: the full turn state machine runs locally and
 * three bots (core's chooseBotMove policy) play the other seats on short
 * timers. The player has 30s per turn; three timeouts and they lose -
 * mirroring the multiplayer rules. Bots never time out.
 */
export function useDemoLudo(): LudoEngine {
  const [state, setState] = useState<DemoState>(freshState);
  const [myCaptures, setMyCaptures] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The bot's ability decision reads the live state without re-running its
  // turn effect on every token change.
  const stateRef = useRef(state);
  stateRef.current = state;

  const schedule = (fn: () => void, ms: number) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(fn, ms);
  };
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const handOver = (prev: DemoState) => ({
    turnColor: nextColorInPlay(SEAT_COLORS, prev.turnColor, []),
    turnStartedAt: Date.now(),
  });

  /** Resolve a roll for whoever's turn it is (pure state transition). */
  const applyRoll = (prev: DemoState): DemoState => {
    if (prev.winner) {
      return prev;
    }
    const die = rollDie();
    const rollId = prev.rollId + 1;
    const sixChain = die === DIE_SIDES ? prev.sixChain + 1 : 0;
    const chargeHp = {
      ...prev.chargeHp,
      [prev.turnColor]: addChargeHp(
        prev.chargeHp[prev.turnColor],
        chargeHpForRoll(die),
      ),
    };
    const thirdSix = die === DIE_SIDES && sixChain >= MAX_CONSECUTIVE_SIXES;
    const movable = legalMoves(
      prev.tokens,
      prev.turnColor,
      die,
      jumpsFor(prev.jumps, prev.turnColor),
    );
    const name = BOT_NAMES[prev.turnColor];

    if (thirdSix) {
      return {
        ...prev,
        die,
        rollId,
        chargeHp,
        stage: 'roll',
        sixChain: 0,
        movable: [],
        notice: `${name} rolled three sixes - turn lost`,
        ...handOver(prev),
      };
    }
    if (movable.length === 0) {
      if (die === DIE_SIDES) {
        return {
          ...prev,
          die,
          rollId,
          chargeHp,
          sixChain,
          movable: [],
          notice: null,
          stage: 'roll',
        };
      }
      return {
        ...prev,
        die,
        rollId,
        chargeHp,
        sixChain: 0,
        movable: [],
        notice: `${name} rolled ${die} - no moves`,
        stage: 'roll',
        ...handOver(prev),
      };
    }
    return {
      ...prev,
      die,
      rollId,
      chargeHp,
      sixChain,
      movable,
      stage: 'move',
      notice: null,
    };
  };

  /** Resolve a chosen token move for whoever's turn it is. */
  const applyTokenMove = (prev: DemoState, tokenIndex: number): DemoState => {
    const die = prev.die!;
    const distance = jumpDistance(
      (prev.tokens[prev.turnColor] ?? [])[tokenIndex]!,
      die,
      hasJump(prev.jumps, prev.turnColor, tokenIndex),
    );
    const result = applyMove(
      prev.tokens,
      prev.turnColor,
      tokenIndex,
      distance,
      prev.shields,
    );
    if (prev.turnColor === MY_COLOR && result.captures.length > 0) {
      setMyCaptures(count => count + result.captures.length);
    }
    const notice =
      result.captures.length > 0
        ? `${BOT_NAMES[prev.turnColor]} captured ${result.captures
            .map(c => LUDO_COLOR_NAMES[c.color])
            .join(' & ')}!`
        : null;
    const landed = {
      ...prev,
      tokens: result.tokens,
      notice,
      chargeHp: creditMove(prev, tokenIndex, result.tokens, result.captures.length),
    };

    if (allTokensHome(landed.tokens, prev.turnColor)) {
      return {
        ...landed,
        movable: [],
        notice: null,
        winner: prev.turnColor,
      };
    }
    const extraRoll = die === DIE_SIDES;
    return {
      ...landed,
      die,
      movable: [],
      stage: 'roll',
      sixChain: extraRoll ? prev.sixChain : 0,
      ...(extraRoll ? {} : handOver(landed)),
    };
  };

  /**
   * An ability cast with a die already pending can leave that die with no
   * legal move, which hands the turn on exactly as a completed move would.
   */
  const settleAbilityTurn = (next: DemoState, prev: DemoState): DemoState => {
    if (next.stage !== 'move') {
      return next;
    }
    const movable = legalMoves(
      next.tokens,
      next.turnColor,
      next.die!,
      jumpsFor(next.jumps, next.turnColor),
    );
    if (movable.length > 0) {
      return { ...next, movable };
    }
    return {
      ...next,
      stage: 'roll',
      movable: [],
      sixChain: 0,
      ...handOver(prev),
    };
  };

  /** Cast a self ability for whoever's turn it is, at either stage. */
  const applyAbilityAction = (
    prev: DemoState,
    action: LudoAbilityAction,
  ): DemoState => {
    const color = prev.turnColor;
    if (prev.winner) {
      return prev;
    }
    const { kind, tokenIndex } = action;
    if (
      prev.abilityUses[color][kind] <= 0 ||
      prev.chargeHp[color] < ABILITY_COST_HP[kind]
    ) {
      return prev;
    }
    const spent: DemoState = {
      ...prev,
      chargeHp: {
        ...prev.chargeHp,
        [color]: prev.chargeHp[color] - ABILITY_COST_HP[kind],
      },
      abilityUses: {
        ...prev.abilityUses,
        [color]: {
          ...prev.abilityUses[color],
          [kind]: prev.abilityUses[color][kind] - 1,
        },
      },
    };

    if (kind === 'jump') {
      if (!jumpableTokens(prev.tokens, color, prev.jumps).includes(tokenIndex)) {
        return prev;
      }
      return settleAbilityTurn(
        {
          ...spent,
          jumps: addJump(prev.jumps, color, tokenIndex),
          notice: `${BOT_NAMES[color]} boosted a pawn with Extra Jump`,
        },
        prev,
      );
    }

    if (kind === 'shield') {
      if (
        !shieldableTokens(prev.tokens, color, prev.shields).includes(tokenIndex)
      ) {
        return prev;
      }
      return settleAbilityTurn(
        {
          ...spent,
          shields: addShield(prev.shields, color, tokenIndex),
          notice: `${BOT_NAMES[color]} shielded a pawn`,
        },
        prev,
      );
    }

    if (kind === 'teleport') {
      if (!teleportableTokens(prev.tokens, color).includes(tokenIndex)) {
        return prev;
      }
      return settleAbilityTurn(
        {
          ...spent,
          tokens: {
            ...prev.tokens,
            [color]: (prev.tokens[color] ?? []).map((p, i) =>
              i === tokenIndex ? TELEPORT_TO : p,
            ),
          },
          notice: `${BOT_NAMES[color]} teleported a pawn to its home stretch`,
        },
        prev,
      );
    }

    if (!launchableTokens(prev.tokens, color).includes(tokenIndex)) {
      return prev;
    }
    const from = prev.tokens[color]![tokenIndex]!;
    const to = launcherTarget(from, LAUNCH_DISTANCE)!;
    const result = applyMove(
      prev.tokens,
      color,
      tokenIndex,
      to - from,
      prev.shields,
    );
    if (color === MY_COLOR && result.captures.length > 0) {
      setMyCaptures(count => count + result.captures.length);
    }
    const launched: DemoState = {
      ...spent,
      tokens: result.tokens,
      notice: `${BOT_NAMES[color]} launched a pawn forward`,
      chargeHp: creditMove(spent, tokenIndex, result.tokens, result.captures.length),
    };
    return allTokensHome(launched.tokens, color)
      ? { ...launched, movable: [], notice: null, winner: color }
      : settleAbilityTurn(launched, prev);
  };

  const lost = state.myTimeouts >= MAX_TIMEOUTS;

  // One ability per bot turn, six-chain re-rolls included: turnStartedAt only
  // moves when the seat does.
  const botAbilityTurnRef = useRef<string | null>(null);

  // Bot turns advance on their own clock; a roll that passed the turn (or a
  // human roll with no moves) already advanced state, so this effect just
  // watches whose turn/stage it is.
  useEffect(() => {
    if (state.winner || lost || state.turnColor === MY_COLOR) {
      return;
    }
    const act = () =>
      setState(prev => {
        if (prev.turnColor === MY_COLOR || prev.winner) {
          return prev;
        }
        if (prev.stage === 'roll') {
          return applyRoll(prev);
        }
        if (prev.movable.length === 0) {
          return prev;
        }
        const pick =
          chooseBotMove(
            prev.tokens,
            prev.turnColor,
            prev.die!,
            jumpsFor(prev.jumps, prev.turnColor),
            prev.shields,
          ) ?? prev.movable[0]!;
        return applyTokenMove(
          prev,
          prev.movable.includes(pick) ? pick : prev.movable[0]!,
        );
      });

    const turnKey = `${state.turnColor}-${state.turnStartedAt}`;
    schedule(() => {
      const bot = stateRef.current;
      const action =
        botAbilityTurnRef.current === turnKey
          ? null
          : pickAbilityAction({
              tokens: bot.tokens,
              color: bot.turnColor,
              opponents: SEAT_COLORS.filter(c => c !== bot.turnColor),
              chargeHp: bot.chargeHp[bot.turnColor],
              usesLeft: bot.abilityUses[bot.turnColor],
              jumps: bot.jumps,
              shields: bot.shields,
            });
      if (!action) {
        act();
        return;
      }
      botAbilityTurnRef.current = turnKey;
      setState(prev => applyAbilityAction(prev, action));
      schedule(act, BOT_ABILITY_PAUSE_MS);
    }, state.stage === 'roll' ? BOT_ROLL_DELAY_MS : BOT_MOVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.turnColor,
    state.turnStartedAt,
    state.stage,
    state.die,
    state.winner,
    lost,
  ]);

  const onRoll = useCallback(() => {
    setState(prev =>
      prev.turnColor === MY_COLOR && prev.stage === 'roll' && !prev.winner
        ? applyRoll(prev)
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMoveToken = useCallback((tokenIndex: number) => {
    setState(prev =>
      prev.turnColor === MY_COLOR &&
      prev.stage === 'move' &&
      prev.movable.includes(tokenIndex)
        ? applyTokenMove(prev, tokenIndex)
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cast = useCallback((kind: LudoAbilityKind, tokenIndex: number) => {
    setState(prev =>
      prev.turnColor === MY_COLOR
        ? applyAbilityAction(prev, { kind, tokenIndex })
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLaunch = useCallback(
    (tokenIndex: number) => cast('launcher', tokenIndex),
    [cast],
  );
  const onJump = useCallback(
    (tokenIndex: number) => cast('jump', tokenIndex),
    [cast],
  );
  const onTeleport = useCallback(
    (tokenIndex: number) => cast('teleport', tokenIndex),
    [cast],
  );
  const onShield = useCallback(
    (tokenIndex: number) => cast('shield', tokenIndex),
    [cast],
  );

  const onTimerExpire = useCallback(() => {
    setState(prev => {
      if (prev.turnColor !== MY_COLOR || prev.winner) {
        return prev;
      }
      return {
        ...prev,
        stage: 'roll',
        die: null,
        sixChain: 0,
        movable: [],
        myTimeouts: prev.myTimeouts + 1,
        notice: 'You ran out of time',
        ...handOver(prev),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result: 'win' | 'lose' | null =
    state.winner === MY_COLOR ? 'win' : state.winner || lost ? 'lose' : null;
  const resultReason: LudoEndReason | null = result
    ? lost && !state.winner
      ? 'timeout'
      : 'complete'
    : null;

  const seats: LudoSeatView[] = SEAT_COLORS.map(color => ({
    userId: color,
    color,
    name: BOT_NAMES[color],
    initial: BOT_NAMES[color].charAt(0).toUpperCase(),
    isMe: color === MY_COLOR,
    online: true,
    eliminated: false,
    homeCount: (state.tokens[color] ?? []).filter(p => p === HOME_PROGRESS)
      .length,
  }));

  return {
    phase: 'play',
    forfeit: () => {},
    playProps: {
      seats,
      tokens: state.tokens,
      eliminatedColors: [],
      myColor: MY_COLOR,
      turnColor: result ? null : state.turnColor,
      myTurn: !result && state.turnColor === MY_COLOR,
      stage: state.stage,
      die: state.die,
      rollId: state.rollId,
      movableTokens: state.turnColor === MY_COLOR ? state.movable : [],
      notice: state.notice,
      turnDeadline: result ? null : state.turnStartedAt + TURN_SECONDS * 1000,
      result,
      resultReason,
      winnerName: state.winner ? BOT_NAMES[state.winner] : null,
      myCaptures,
      chargeHp: state.chargeHp[MY_COLOR],
      usesLeft: state.abilityUses[MY_COLOR],
      jumps: state.jumps,
      shields: state.shields,
      onRoll,
      onMoveToken,
      onLaunch,
      onJump,
      onTeleport,
      onShield,
      onTimerExpire,
    },
  };
}
