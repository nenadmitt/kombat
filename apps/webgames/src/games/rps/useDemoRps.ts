import {
  MAX_TIMEOUTS,
  randomMove,
  resolveRound,
  TURN_SECONDS,
  WIN_TARGET,
  type RpsEndReason,
  type RpsMove,
} from '@gaming-platform/core';
import { useCallback, useState } from 'react';

import { revealHeadline } from './reveal-headline';
import type { RpsEngine, RpsPlayProps, RpsStage } from './rps-engine';

const BOT_NAME = 'Kraken';

type RevealInfo = NonNullable<RpsPlayProps['reveal']>;

/**
 * Local best-of-five against a bot that plays a uniformly random move. No
 * room, no socket, no stake: the rules come from core, everything else is
 * this hook.
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

  const resolve = useCallback(
    (mine: RpsMove | null, timedOut: boolean) => {
      const theirs = randomMove();
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
      if (timedOut) setMyTimeouts(nextTimeouts);

      setReveal({
        myMove: mine,
        opponentMove: theirs,
        result,
        headline: revealHeadline(mine, theirs, outcome),
      });
      setStage('revealing');

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
      if (stage !== 'choosing' || myMove) return;
      setMyMove(move);
      resolve(move, false);
    },
    [stage, myMove, resolve],
  );

  const onTimerExpire = useCallback(() => {
    if (stage !== 'choosing' || myMove) return;
    resolve(null, true);
  }, [stage, myMove, resolve]);

  const onNextRound = useCallback(() => {
    if (ended) return;
    const wasDecisive = reveal?.result !== 'tie';
    setStage('choosing');
    setReveal(null);
    setMyMove(null);
    setRoundStartedAt(Date.now());
    if (wasDecisive) setRound(r => r + 1);
  }, [ended, reveal]);

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
      ended || stage === 'revealing'
        ? null
        : roundStartedAt + TURN_SECONDS * 1000,
    result: ended,
    resultReason: endReason,
    onLock,
    onNextRound,
    onTimerExpire,
  };

  return { phase: 'play', forfeit: () => {}, playProps };
}
