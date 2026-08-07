import { RPS_MOVES, WIN_TARGET, type RpsMove } from '@gaming-platform/core';
import { HandFist, Trophy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { initialOf } from '../../lib/format';
import { RpsIcon } from './RpsIcon';
import type { RpsPlayProps } from './rps-engine';
import type { ResultExtras } from '../use-result-data';

/** Result copy per outcome and end reason. */
const RESULT_COPY = {
  win: {
    complete: {
      eyebrow: 'BEST OF FIVE',
      message: (name: string) => `You out-read ${name} and took the match.`,
    },
    forfeit: {
      eyebrow: 'OPPONENT FORFEITED',
      message: (name: string) => `${name} walked away. The match is yours.`,
    },
    timeout: {
      eyebrow: 'WON BY TIMEOUT',
      message: (name: string) => `${name} let the clock run out once too often.`,
    },
  },
  lose: {
    complete: {
      eyebrow: 'BEST OF FIVE',
      message: (name: string) => `${name} read you better this time. Run it back.`,
    },
    forfeit: {
      eyebrow: 'MATCH FORFEITED',
      message: () => 'You forfeited the match and handed over the win.',
    },
    timeout: {
      eyebrow: 'LOST BY TIMEOUT',
      message: () => 'You let the clock run out once too often.',
    },
  },
} as const;

const MOVE_LABELS: Record<RpsMove, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
};

export function RpsBoard(
  props: RpsPlayProps & ResultExtras,
) {
  const {
    opponent,
    myOnline,
    round,
    myScore,
    opponentScore,
    myMove,
    opponentLocked,
    stage,
    reveal,
    roundDeadline,
    result,
    resultReason,
    onLock,
    onNextRound,
  } = props;

  const secondsLeft = useCountdown(roundDeadline, props.onTimerExpire);

  if (result) {
    const won = result === 'win';
    const copy = RESULT_COPY[won ? 'win' : 'lose'][resultReason ?? 'complete'];
    return (
      <GameResultScreen
        variant={won ? 'win' : 'lose'}
        icon={won ? Trophy : HandFist}
        eyebrow={copy.eyebrow}
        title={won ? 'Victory' : 'Defeat'}
        message={copy.message(opponent.name)}
        opponent={{
          initial: opponent.initial,
          label: won ? 'DEFEATED' : 'LOST TO',
          name: opponent.name,
        }}
        stats={[
          {
            value: `${myScore} - ${opponentScore}`,
            label: 'ROUNDS',
            highlight: true,
          },
          { value: String(myScore + opponentScore), label: 'ROUNDS PLAYED' },
        ]}
        meters={
          props.winRate === null || props.winRate === undefined
            ? undefined
            : [{ label: 'Your win rate', percent: props.winRate }]
        }
        settlement={props.settlement}
        onBack={props.onBack}
        onPlayAgain={props.onPlayAgain}
      />
    );
  }

  return (
    <div className="arena">
      <div className="score-strip">
        <div className="score-side">
          <Avatar initial={opponent.initial} online={opponent.online} />
          <div className="score-meta">
            <span className="player-name">{opponent.name}</span>
            <ScorePips score={opponentScore} />
          </div>
        </div>
        <span className="score-num">{opponentScore}</span>
        <span className="score-vs">VS</span>
        <span className="score-num is-me">{myScore}</span>
        <div className="score-side is-right">
          <div className="score-meta is-right">
            <span className="player-name">You</span>
            <ScorePips score={myScore} />
          </div>
          <Avatar initial="Y" online={myOnline} mine />
        </div>
      </div>

      {stage === 'revealing' && reveal ? (
        <div className="arena-body">
          <div className="hand-row">
            <HandSlot move={reveal.opponentMove} won={reveal.result === 'loss'} />
            <div className="hand-divider">
              <span className="hand-divider-line" />
              <span className="hand-vs">VS</span>
              <span className="hand-divider-line" />
            </div>
            <HandSlot move={reveal.myMove} won={reveal.result === 'win'} mine />
          </div>
          <div
            className="reveal-headline"
            style={{
              color:
                reveal.result === 'win'
                  ? 'var(--win)'
                  : reveal.result === 'loss'
                    ? 'var(--loss)'
                    : 'var(--text-3)',
            }}
          >
            {reveal.headline}
          </div>
          <button type="button" className="btn btn-lime btn-lg" onClick={onNextRound}>
            Next round
          </button>
        </div>
      ) : (
        <div className="arena-body">
          <div className="round-line">
            <span className="card-label">ROUND {round}</span>
            <span
              className="mono round-clock"
              style={{
                color:
                  secondsLeft !== null && secondsLeft <= 5
                    ? 'var(--loss)'
                    : 'var(--text)',
              }}
            >
              {secondsLeft === null ? '--' : secondsLeft}
            </span>
            <span className="card-label">FIRST TO {WIN_TARGET}</span>
          </div>

          <div className="hand-row">
            <div className="hand-stack">
              <span className={opponentLocked ? 'hand-slot is-locked' : 'hand-slot'}>
                <span className={opponentLocked ? 'q-mark' : 'q-mark is-waiting'}>
                  ?
                </span>
              </span>
              <span className="lock-badge">
                {opponentLocked ? 'LOCKED IN' : 'CHOOSING'}
              </span>
            </div>

            <div className="hand-divider">
              <span className="hand-divider-line" />
              <span className="hand-vs">VS</span>
              <span className="hand-divider-line" />
            </div>

            <div className="hand-stack">
              <span className={myMove ? 'hand-slot is-locked' : 'hand-slot'}>
                {myMove ? (
                  <RpsIcon move={myMove} size={72} color="var(--lime)" />
                ) : (
                  <span className="q-mark is-waiting">?</span>
                )}
              </span>
              <span className="lock-badge">
                {myMove ? 'YOUR PICK' : 'PICK A MOVE'}
              </span>
            </div>
          </div>

          <div className="move-row">
            {RPS_MOVES.map(move => {
              const chosen = myMove === move;
              return (
                <button
                  key={move}
                  type="button"
                  className={chosen ? 'move-btn is-chosen' : 'move-btn'}
                  onClick={() => onLock(move)}
                  disabled={Boolean(myMove)}
                  aria-label={MOVE_LABELS[move]}
                >
                  <RpsIcon
                    move={move}
                    size={52}
                    color={chosen ? 'var(--lime)' : 'var(--text-2)'}
                  />
                  <span>{MOVE_LABELS[move]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({
  initial,
  online,
  mine = false,
}: {
  initial: string;
  online: boolean;
  mine?: boolean;
}) {
  return (
    <span className={mine ? 'seat-avatar is-me' : 'seat-avatar'}>
      {initialOf(initial)}
      <span
        className="presence-dot"
        style={{ background: online ? 'var(--win)' : 'var(--loss)' }}
      />
    </span>
  );
}

function ScorePips({ score }: { score: number }) {
  return (
    <span className="pips">
      {Array.from({ length: WIN_TARGET }, (_, index) => (
        <span key={index} className={index < score ? 'pip is-on' : 'pip'} />
      ))}
    </span>
  );
}

function HandSlot({
  move,
  won,
  mine = false,
}: {
  move: RpsMove | null;
  won: boolean;
  mine?: boolean;
}) {
  return (
    <div className="hand-stack">
      <span className={won ? 'hand-slot is-winner' : 'hand-slot'}>
        {move ? (
          <RpsIcon
            move={move}
            size={72}
            color={won ? 'var(--win)' : 'var(--text-2)'}
          />
        ) : (
          <span className="q-mark">-</span>
        )}
      </span>
      <span className="lock-badge">{mine ? 'YOU' : 'THEM'}</span>
    </div>
  );
}

/** Whole seconds remaining, firing `onExpire` once when it hits zero. */
function useCountdown(
  deadline: number | null,
  onExpire?: () => void,
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const remaining =
    deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = remaining === 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // Once per deadline: onExpire itself guards re-entry.
  }, [expired, deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  return remaining;
}
