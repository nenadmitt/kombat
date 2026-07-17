import { useCallback, useEffect, useRef, useState } from 'react';
import {
  botMove,
  describeOutcome,
  MAX_TIMEOUTS,
  resolveRound,
  TURN_SECONDS,
  WIN_TARGET,
  type RpsEndReason,
  type RpsMove,
} from '@gaming-platform/core';

import { revealHeadline } from './reveal-headline';
import type { RpsEngine, RpsPlayProps, RpsStage } from './rps-engine';

const BOT_NAME = 'Kraken';

type RevealInfo = {
  myMove: RpsMove | null;
  opponentMove: RpsMove | null;
  result: 'win' | 'loss' | 'tie';
  headline: string;
};

/**
 * Single-player demo engine: full local best-of-5 vs a bot (core botMove
 * policy). The player picks a move; the bot picks concurrently and the round
 * reveals. 30s per round; three timeouts and the player loses - mirroring the
 * multiplayer rules.
 */
export function useDemoRps(): RpsEngine {
  const [round, setRound] = useState(1);
  const [myScore, setMyScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [myMove, setMyMove] = useState<RpsMove | null>(null);
  const [stage, setStage] = useState<RpsStage>('choosing');
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [myTimeouts, setMyTimeouts] = useState(0);
  const [roundStartedAt, setRoundStartedAt] = useState(() => Date.now());
  const [ended, setEnded] = useState<'win' | 'lose' | null>(null);
  const [endReason, setEndReason] = useState<RpsEndReason | null>(null);

  // The bot adapts to the human's past picks.
  const historyRef = useRef<RpsMove[]>([]);

  /** Resolve a round given the player's move (or null for a timeout). */
  const resolve = useCallback(
    (mine: RpsMove | null, timedOut: boolean) => {
      const theirs = botMove(historyRef.current);
      if (mine) {
        historyRef.current = [...historyRef.current, mine];
      }
      const outcome = resolveRound(mine, theirs);
      const result: RevealInfo['result'] =
        outcome === 1 ? 'win' : outcome === -1 ? 'loss' : 'tie';

      let nextMy = myScore;
      let nextBot = botScore;
      if (outcome === 1) {
        nextMy += 1;
        setMyScore(nextMy);
      } else if (outcome === -1) {
        nextBot += 1;
        setBotScore(nextBot);
      }

      const nextTimeouts = timedOut ? myTimeouts + 1 : myTimeouts;
      if (timedOut) {
        setMyTimeouts(nextTimeouts);
      }

      const headline = revealHeadline(mine, theirs, outcome);

      setReveal({ myMove: mine, opponentMove: theirs, result, headline });
      setStage('revealing');

      // Decide match end after this reveal (applied on Next Round).
      if (nextTimeouts >= MAX_TIMEOUTS) {
        setEnded('lose');
        setEndReason('timeout');
      } else if (nextMy >= WIN_TARGET) {
        setEnded('win');
        setEndReason('complete');
      } else if (nextBot >= WIN_TARGET) {
        setEnded('lose');
        setEndReason('complete');
      }
    },
    [myScore, botScore, myTimeouts],
  );

  const onLock = useCallback(
    (move: RpsMove) => {
      if (stage !== 'choosing' || myMove) {
        return;
      }
      setMyMove(move);
      resolve(move, false);
    },
    [stage, myMove, resolve],
  );

  const onTimerExpire = useCallback(() => {
    if (stage !== 'choosing' || myMove) {
      return;
    }
    resolve(null, true);
  }, [stage, myMove, resolve]);

  const onNextRound = useCallback(() => {
    if (ended) {
      return; // result screen takes over via `result`
    }
    const wasDecisive = reveal?.result !== 'tie';
    setStage('choosing');
    setReveal(null);
    setMyMove(null);
    setRoundStartedAt(Date.now());
    if (wasDecisive) {
      setRound(r => r + 1);
    }
  }, [ended, reveal]);

  const result = ended;
  const playProps: RpsPlayProps = {
    opponent: { name: BOT_NAME, initial: 'K', online: true },
    myOnline: true,
    round,
    myScore,
    opponentScore: botScore,
    myMove,
    opponentLocked: false,
    stage,
    reveal,
    roundDeadline:
      result || stage === 'revealing'
        ? null
        : roundStartedAt + TURN_SECONDS * 1000,
    result,
    resultReason: endReason,
    onLock,
    onNextRound,
    onTimerExpire,
  };

  return { phase: 'play', forfeit: () => {}, playProps };
}
