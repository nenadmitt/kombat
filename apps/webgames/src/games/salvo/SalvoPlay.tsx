import {
  SALVO_MAX_ANGLE,
  SALVO_MAX_POWER,
  SALVO_MIN_ANGLE,
  SALVO_MIN_POWER,
  SALVO_MOVE_RANGE,
  SalvoSide,
  salvoAccuracy,
} from '@gaming-platform/core';
import { CaretLeft, CaretRight, Crosshair, Wind } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { SalvoBattlefield } from './SalvoBattlefield';
import type { SalvoPlayProps } from './salvo-engine';
import { Countdown } from '../battleship/Countdown';

/** One press of a dial. Angle is finer than power, as on mobile. */
const STEP = { angle: 1, power: 2 };

/** The battlefield renders at its native width and scales down to fit. */
const FIELD_WIDTH = 560;

const RESULT_COPY = {
  win: {
    destroyed: {
      eyebrow: 'HULL DESTROYED',
      message: (name: string) => `${name}'s tank is scrap. The field is yours.`,
    },
    forfeit: {
      eyebrow: 'OPPONENT FORFEITED',
      message: (name: string) => `${name} pulled off the field. The win is yours.`,
    },
    timeout: {
      eyebrow: 'WON BY TIMEOUT',
      message: (name: string) => `${name} ran out of time once too often.`,
    },
  },
  lose: {
    destroyed: {
      eyebrow: 'HULL LOST',
      message: () => 'Your tank was destroyed. Re-arm and take the field again.',
    },
    forfeit: {
      eyebrow: 'MATCH FORFEITED',
      message: () => 'You pulled off the field and handed over the win.',
    },
    timeout: {
      eyebrow: 'LOST BY TIMEOUT',
      message: () => 'You ran out of time once too often.',
    },
  },
} as const;

export function SalvoPlay(
  props: SalvoPlayProps & { onBack: () => void; onPlayAgain?: () => void },
) {
  const {
    terrain,
    seats,
    me,
    myTurn,
    armed,
    movesLeft,
    wind,
    shotNumber,
    round,
    flight,
    trail,
    aiming,
    damage,
    destroyed,
    notice,
    turnDeadline,
    result,
    resultReason,
    stats,
    onAim,
    onMove,
    onFire,
    onTimerExpire,
    onBack,
    onPlayAgain,
  } = props;

  const mine = seats.find(seat => seat.side === me);
  const foe = seats.find(seat => seat.side !== me);

  // Keep the shell in view as it flies across a field wider than the panel.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !flight) return;
    const target =
      (flight.shell.x / terrain.width) * box.scrollWidth - box.clientWidth / 2;
    box.scrollLeft = Math.max(0, target);
  }, [flight, terrain.width]);

  if (result) {
    const record = stats[me];
    const copy = RESULT_COPY[result === 'win' ? 'win' : 'lose'][
      resultReason ?? 'destroyed'
    ];
    return (
      <GameResultScreen
        variant={result === 'win' ? 'win' : 'lose'}
        eyebrow={copy.eyebrow}
        title={result === 'win' ? 'VICTORY' : 'DEFEAT'}
        message={copy.message(foe?.name ?? 'Your opponent')}
        opponent={
          foe
            ? {
                initial: foe.initial,
                label: result === 'win' ? 'DESTROYED' : 'LOST TO',
                name: foe.name,
              }
            : undefined
        }
        stats={[
          { value: String(record.shots), label: 'SHOTS' },
          {
            value: `${salvoAccuracy(record)}%`,
            label: 'ACCURACY',
            highlight: result === 'win',
          },
          { value: String(record.bestHit), label: 'BEST HIT' },
          { value: String(round), label: 'ROUNDS' },
        ]}
        onBack={onBack}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  return (
    <div className="salvo-play">
      <div className="salvo-stage">
        <div className="salvo-hud">
          <HullBar seat={mine} label="You" />
          <div className="salvo-hud-mid">
            <span className="card-label">
              SHOT {shotNumber} · ROUND {round}
            </span>
            <span className="salvo-wind">
              <Wind size={14} color="var(--lime)" />
              <span className="mono">
                {wind === 0 ? 'CALM' : `${Math.abs(wind)} ${wind > 0 ? '→' : '←'}`}
              </span>
            </span>
          </div>
          <HullBar seat={foe} label={foe?.name ?? 'Opponent'} align="right" />
        </div>

        <div className="salvo-viewport" ref={scrollRef}>
          <SalvoBattlefield
            terrain={terrain}
            seats={seats}
            width={FIELD_WIDTH}
            trajectory={trail?.path ?? null}
            trajectorySide={trail?.shooter ?? null}
            impact={trail?.impact ?? null}
            impactId={trail?.id ?? null}
            shell={flight?.shell ?? null}
            aiming={aiming}
            destroyed={destroyed}
            draggableSide={armed ? me : null}
            onAimAngle={angle => onAim({ angle })}
          />
        </div>

        {(notice || damage) && (
          <div className="salvo-notice">
            {notice ?? ''}
            {damage?.hits.map(hit => (
              <span
                key={`${hit.side}-${hit.amount}`}
                className="salvo-damage"
                style={{
                  color: hit.side === me ? 'var(--loss)' : 'var(--win)',
                }}
              >
                {' '}
                -{hit.amount}
              </span>
            ))}
          </div>
        )}
      </div>

      <aside className="salvo-side">
        <div className="card bs-turn-card">
          <span className="card-label">{myTurn ? 'YOUR TURN' : 'THEIR TURN'}</span>
          {turnDeadline ? (
            <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
          ) : (
            <span className="mono bs-clock-value">--</span>
          )}
        </div>

        <div className="card">
          <Dial
            label="ANGLE"
            value={`${mine?.angle ?? 0}°`}
            disabled={!armed}
            onStep={delta => onAim({ angle: (mine?.angle ?? 0) + delta * STEP.angle })}
            fill={
              ((mine?.angle ?? 0) - SALVO_MIN_ANGLE) /
              (SALVO_MAX_ANGLE - SALVO_MIN_ANGLE)
            }
          />
          <Dial
            label="POWER"
            value={String(mine?.power ?? 0)}
            disabled={!armed}
            onStep={delta => onAim({ power: (mine?.power ?? 0) + delta * STEP.power })}
            fill={
              ((mine?.power ?? 0) - SALVO_MIN_POWER) /
              (SALVO_MAX_POWER - SALVO_MIN_POWER)
            }
          />
        </div>

        <div className="card">
          <div className="salvo-drive-head">
            <span className="card-label">DRIVE</span>
            <span className="mono" style={{ color: 'var(--lime)' }}>
              {Math.round(movesLeft)}
            </span>
          </div>
          <div className="bs-charge-track" style={{ marginTop: 'var(--s-3)' }}>
            <span
              className="bs-charge-fill"
              style={{ transform: `scaleX(${movesLeft / SALVO_MOVE_RANGE})` }}
            />
          </div>
          <div className="salvo-drive-row">
            <button
              type="button"
              className="btn btn-surface btn-block"
              disabled={!armed || movesLeft <= 0}
              onClick={() => onMove(-1)}
              aria-label="Drive left"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              className="btn btn-surface btn-block"
              disabled={!armed || movesLeft <= 0}
              onClick={() => onMove(1)}
              aria-label="Drive right"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-lime btn-block btn-lg bs-fire"
          disabled={!armed}
          onClick={onFire}
        >
          <Crosshair size={18} weight="bold" />
          {armed ? 'FIRE' : myTurn ? 'DRIVING' : 'WAITING'}
        </button>
      </aside>
    </div>
  );
}

function HullBar({
  seat,
  label,
  align = 'left',
}: {
  seat: { hp: number; initial: string; side: SalvoSide } | undefined;
  label: string;
  align?: 'left' | 'right';
}) {
  const hp = Math.max(0, seat?.hp ?? 0);
  return (
    <div className={align === 'right' ? 'salvo-hull is-right' : 'salvo-hull'}>
      <span
        className={
          seat?.side === SalvoSide.Left ? 'seat-avatar is-me' : 'seat-avatar'
        }
      >
        {seat?.initial ?? '?'}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="player-name">{label}</div>
        <div className="salvo-hp-track">
          <span
            className="salvo-hp-fill"
            style={{
              transform: `scaleX(${hp / 100})`,
              background: hp > 40 ? 'var(--win)' : 'var(--loss)',
            }}
          />
        </div>
      </div>
      <span className="mono salvo-hp-value">{hp}</span>
    </div>
  );
}

function Dial({
  label,
  value,
  fill,
  disabled,
  onStep,
}: {
  label: string;
  value: string;
  fill: number;
  disabled: boolean;
  onStep: (delta: -1 | 1) => void;
}) {
  return (
    <div className="salvo-dial">
      <div className="salvo-dial-head">
        <span className="card-label">{label}</span>
        <span className="mono salvo-dial-value">{value}</span>
      </div>
      <div className="bs-charge-track">
        <span
          className="bs-charge-fill"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, fill))})` }}
        />
      </div>
      <div className="salvo-drive-row">
        <button
          type="button"
          className="btn btn-surface btn-block"
          disabled={disabled}
          onClick={() => onStep(-1)}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-surface btn-block"
          disabled={disabled}
          onClick={() => onStep(1)}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
