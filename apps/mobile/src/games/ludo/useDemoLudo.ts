import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DIE_SIDES,
  HOME_PROGRESS,
  LUDO_COLORS,
  MAX_CONSECUTIVE_SIXES,
  MAX_TIMEOUTS,
  TURN_SECONDS,
  allTokensHome,
  applyMove,
  chooseBotMove,
  initialTokens,
  legalMoves,
  nextColorInPlay,
  type LudoColor,
  type LudoEndReason,
  type LudoStage,
  type LudoTokens,
} from '@gaming-platform/core';

import { LUDO_COLOR_NAMES } from './ludo-theme';
import type { LudoEngine, LudoSeatView } from './ludo-engine';

/** Demo table: the player is red, three bots fill the other seats. */
const BOT_NAMES: Record<LudoColor, string> = {
  red: 'You',
  green: 'Milo',
  yellow: 'Ava',
  blue: 'Rex',
};
const MY_COLOR: LudoColor = 'red';
const SEAT_COLORS = [...LUDO_COLORS];

const BOT_ROLL_DELAY_MS = 900;
const BOT_MOVE_DELAY_MS = 750;
/** Pause so a roll that ends the turn (no moves / third six) stays readable. */
const PASS_DELAY_MS = 1000;

type DemoState = {
  tokens: LudoTokens;
  turnColor: LudoColor;
  stage: LudoStage;
  die: number | null;
  sixChain: number;
  movable: number[];
  notice: string | null;
  winner: LudoColor | null;
  myTimeouts: number;
  turnStartedAt: number;
};

const freshState = (): DemoState => ({
  tokens: initialTokens(SEAT_COLORS),
  turnColor: MY_COLOR,
  stage: 'roll',
  die: null,
  sixChain: 0,
  movable: [],
  notice: null,
  winner: null,
  myTimeouts: 0,
  turnStartedAt: Date.now(),
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

  /** Resolve a roll for whoever's turn it is (pure state transition). */
  const applyRoll = (prev: DemoState): DemoState => {
    const die = rollDie();
    const sixChain = die === DIE_SIDES ? prev.sixChain + 1 : 0;
    if (die === DIE_SIDES && sixChain >= MAX_CONSECUTIVE_SIXES) {
      return {
        ...prev,
        die,
        stage: 'roll',
        sixChain: 0,
        movable: [],
        notice: `${BOT_NAMES[prev.turnColor]} rolled three sixes - turn lost`,
        turnColor: nextColorInPlay(SEAT_COLORS, prev.turnColor, []),
        turnStartedAt: Date.now(),
      };
    }
    const movable = legalMoves(prev.tokens, prev.turnColor, die);
    if (movable.length === 0) {
      if (die === DIE_SIDES) {
        return { ...prev, die, sixChain, movable: [], notice: null, stage: 'roll' };
      }
      return {
        ...prev,
        die,
        sixChain: 0,
        movable: [],
        notice: `${BOT_NAMES[prev.turnColor]} rolled ${die} - no moves`,
        stage: 'roll',
        turnColor: nextColorInPlay(SEAT_COLORS, prev.turnColor, []),
        turnStartedAt: Date.now(),
      };
    }
    return { ...prev, die, sixChain, movable, stage: 'move', notice: null };
  };

  /** Resolve a chosen token move for whoever's turn it is. */
  const applyTokenMove = (prev: DemoState, tokenIndex: number): DemoState => {
    const die = prev.die!;
    const result = applyMove(prev.tokens, prev.turnColor, tokenIndex, die);
    if (prev.turnColor === MY_COLOR && result.captures.length > 0) {
      setMyCaptures(count => count + result.captures.length);
    }
    const notice =
      result.captures.length > 0
        ? `${BOT_NAMES[prev.turnColor]} captured ${result.captures
            .map(c => LUDO_COLOR_NAMES[c.color])
            .join(' & ')}!`
        : null;

    if (allTokensHome(result.tokens, prev.turnColor)) {
      return {
        ...prev,
        tokens: result.tokens,
        movable: [],
        notice: null,
        winner: prev.turnColor,
      };
    }
    const extraRoll = die === DIE_SIDES;
    return {
      ...prev,
      tokens: result.tokens,
      die,
      movable: [],
      notice,
      stage: 'roll',
      sixChain: extraRoll ? prev.sixChain : 0,
      turnColor: extraRoll
        ? prev.turnColor
        : nextColorInPlay(SEAT_COLORS, prev.turnColor, []),
      turnStartedAt: extraRoll ? prev.turnStartedAt : Date.now(),
    };
  };

  const lost = state.myTimeouts >= MAX_TIMEOUTS;

  // Bot turns advance on their own clock; a roll that passed the turn (or a
  // human roll with no moves) already advanced state, so this effect just
  // watches whose turn/stage it is.
  useEffect(() => {
    if (state.winner || lost) {
      return;
    }
    if (state.turnColor !== MY_COLOR) {
      if (state.stage === 'roll') {
        schedule(() => setState(applyRoll), BOT_ROLL_DELAY_MS);
      } else {
        schedule(() => {
          setState(prev => {
            const pick =
              chooseBotMove(prev.tokens, prev.turnColor, prev.die!) ??
              prev.movable[0]!;
            return applyTokenMove(
              prev,
              prev.movable.includes(pick) ? pick : prev.movable[0]!,
            );
          });
        }, BOT_MOVE_DELAY_MS);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turnColor, state.stage, state.die, state.winner, lost]);

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
        turnColor: nextColorInPlay(SEAT_COLORS, MY_COLOR, []),
        turnStartedAt: Date.now(),
      };
    });
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
      movableTokens: state.turnColor === MY_COLOR ? state.movable : [],
      notice: state.notice,
      turnDeadline: result ? null : state.turnStartedAt + TURN_SECONDS * 1000,
      result,
      resultReason,
      winnerName: state.winner ? BOT_NAMES[state.winner] : null,
      myCaptures,
      onRoll,
      onMoveToken,
      onTimerExpire,
    },
  };
}
