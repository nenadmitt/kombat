import { TOKENS_PER_PLAYER } from '@gaming-platform/core';
import { Cube, Trophy } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { Countdown } from '../battleship/Countdown';
import { LudoBoard } from './LudoBoard';
import { LudoDice } from './LudoDice';
import type { LudoPlayProps } from './ludo-engine';
import { LUDO_COLOR_HEX } from './ludo-theme';
import type { ResultExtras } from '../use-result-data';

/** How long the die tumbles before it settles on the rolled value. */
const ROLL_ANIMATION_MS = 550;

const WIN_COPY = {
  complete: {
    eyebrow: 'ALL PAWNS HOME',
    message: 'You raced every pawn home first. The table is yours.',
  },
  forfeit: {
    eyebrow: 'LAST PLAYER STANDING',
    message: 'Everyone else dropped out. The table is yours.',
  },
  timeout: {
    eyebrow: 'LAST PLAYER STANDING',
    message: 'Everyone else ran out of time. The table is yours.',
  },
} as const;

const LOSE_COPY = {
  complete: {
    eyebrow: 'RACE LOST',
    message: (winner: string) => `${winner} brought every pawn home first.`,
  },
  forfeit: {
    eyebrow: 'MATCH FORFEITED',
    message: () => 'You left the match and were eliminated.',
  },
  timeout: {
    eyebrow: 'OUT OF TIME',
    message: () => 'You ran out of time once too often and were eliminated.',
  },
} as const;

export function LudoPlay(props: LudoPlayProps & ResultExtras) {
  const {
    seats,
    tokens,
    eliminatedColors,
    myColor,
    turnColor,
    myTurn,
    stage,
    die,
    rollId,
    movableTokens,
    notice,
    turnDeadline,
    result,
    resultReason,
    winnerName,
    myCaptures,
    onRoll,
    onMoveToken,
    onTimerExpire,
    onBack,
    onPlayAgain,
    settlement,
    winRate,
  } = props;

  // The die tumbles on every roll, including a repeat of the same value.
  const [rolling, setRolling] = useState(false);
  const firstRoll = useRef(true);
  useEffect(() => {
    if (firstRoll.current) {
      firstRoll.current = false;
      return;
    }
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [rollId]);

  if (result) {
    const won = result === 'win';
    const reason = resultReason ?? 'complete';
    const mine = seats.find(seat => seat.color === myColor);
    const copy = won
      ? { eyebrow: WIN_COPY[reason].eyebrow, message: WIN_COPY[reason].message }
      : {
          eyebrow: LOSE_COPY[reason].eyebrow,
          message: LOSE_COPY[reason].message(winnerName ?? 'Another player'),
        };

    return (
      <GameResultScreen
        variant={result}
        icon={won ? Trophy : Cube}
        eyebrow={copy.eyebrow}
        title={won ? 'Victory' : 'Defeat'}
        message={copy.message}
        stats={[
          {
            value: `${mine?.homeCount ?? 0} / ${TOKENS_PER_PLAYER}`,
            label: 'PAWNS HOME',
            highlight: true,
          },
          { value: String(myCaptures), label: 'CAPTURES' },
          { value: String(seats.length), label: 'PLAYERS' },
        ]}
        meters={
          winRate === null || winRate === undefined
            ? undefined
            : [{ label: 'Your win rate', percent: winRate }]
        }
        settlement={settlement}
        onBack={onBack}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const turnSeat = seats.find(seat => seat.color === turnColor) ?? null;
  const hint =
    notice ??
    (myTurn
      ? stage === 'roll'
        ? 'Roll a 6 to release a pawn, or move one already out.'
        : `Pick a glowing pawn to move ${die ?? ''}.`
      : turnSeat
        ? `${turnSeat.name} is playing...`
        : 'Waiting for the next turn.');

  return (
    <div className="ludo-play">
      <div className="ludo-stage">
        <div className="ludo-board-panel">
          {/* Phones hide the sidebar turn strip; this pill is its stand-in. */}
          <div className={myTurn ? 'ludo-turn-pill' : 'ludo-turn-pill is-theirs'}>
            <span
              className="turn-dot"
              style={
                turnColor ? { background: LUDO_COLOR_HEX[turnColor] } : undefined
              }
            />
            <span className="ludo-turn-pill-name">
              {myTurn ? 'YOU' : (turnSeat?.name ?? '--')}
            </span>
            {turnDeadline && <Countdown deadline={turnDeadline} />}
          </div>
          <LudoBoard
            seatedColors={seats.map(seat => seat.color)}
            tokens={tokens}
            eliminated={eliminatedColors}
            myColor={myColor}
            movableTokens={movableTokens}
            onTokenPick={onMoveToken}
          />
        </div>
      </div>

      <aside className="ludo-side">
        <div className={myTurn ? 'match-turn' : 'match-turn is-theirs'}>
          <span className="match-turn-label">
            <span className="turn-dot" />
            {myTurn ? 'YOUR TURN' : turnSeat ? `${turnSeat.name.toUpperCase()}` : '--'}
          </span>
          {turnDeadline ? (
            <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
          ) : (
            <span className="mono bs-clock-value">--</span>
          )}
        </div>

        {/* Every seat, so a 2-, 3- or 4-player table reads the same. */}
        <div className="ludo-seats">
          {seats.map(seat => (
            <div
              key={seat.userId}
              className={
                seat.eliminated
                  ? 'ludo-seat is-out'
                  : seat.color === turnColor
                    ? 'ludo-seat is-turn'
                    : 'ludo-seat'
              }
              style={{ '--seat': LUDO_COLOR_HEX[seat.color] } as React.CSSProperties}
            >
              <span className="ludo-seat-avatar">{seat.initial}</span>
              <div className="ludo-seat-meta">
                <span className="ludo-seat-name">{seat.name}</span>
                <span className="ludo-seat-sub">
                  {seat.eliminated
                    ? 'Eliminated'
                    : `${seat.homeCount}/${TOKENS_PER_PLAYER} home`}
                </span>
              </div>
              <span
                className={seat.online ? 'ludo-seat-dot is-online' : 'ludo-seat-dot'}
              />
            </div>
          ))}
        </div>

        {/* Die, hint and button share the tray, so the sticky mobile tray
            keeps the die on screen too. */}
        <div className="match-actions">
          <div className="ludo-roll">
            <LudoDice value={die} rolling={rolling} />
            <p className="ludo-hint">{hint}</p>
          </div>
          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            disabled={!myTurn || stage !== 'roll'}
            onClick={onRoll}
          >
            <Cube size={18} weight="fill" />
            {myTurn && stage === 'move' ? 'Move a pawn' : 'Roll dice'}
          </button>
        </div>
      </aside>
    </div>
  );
}
