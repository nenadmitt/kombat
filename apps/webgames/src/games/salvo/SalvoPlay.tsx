import {
  SALVO_MAX_ANGLE,
  SALVO_MAX_POWER,
  SALVO_MIN_ANGLE,
  SALVO_MIN_POWER,
  SALVO_MOVE_RANGE,
  SalvoSide,
  salvoAccuracy,
} from '@gaming-platform/core';
import {
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  CaretRight,
  Crosshair,
  Minus,
  Plus,
} from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { SalvoBattlefield } from './SalvoBattlefield';
import type { SalvoPlayProps } from './salvo-engine';
import type { ResultExtras } from '../use-result-data';
import { Countdown } from '../battleship/Countdown';

/** One press of a dial. Angle is finer than power, as on mobile. */
const STEP = { angle: 1, power: 2 };

/** The battlefield renders at its native width and scales down to fit. */
const FIELD_WIDTH = 560;

/** Drive segments in the meter; the underlying range is continuous. */
const DRIVE_PIPS = 5;

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
  props: SalvoPlayProps & ResultExtras,
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
    settlement,
    winRate,
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

  // Space fires, as the key hint on the button promises.
  useEffect(() => {
    if (!armed) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || target?.closest('input, textarea, button')) {
        return;
      }
      event.preventDefault();
      onFire();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, onFire]);

  if (result) {
    const record = stats[me];
    const copy = RESULT_COPY[result === 'win' ? 'win' : 'lose'][
      resultReason ?? 'destroyed'
    ];
    return (
      <GameResultScreen
        variant={result === 'win' ? 'win' : 'lose'}
        eyebrow={copy.eyebrow}
        title={result === 'win' ? 'Victory' : 'Defeat'}
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
          { value: String(record.bestHit), label: 'BEST HIT', highlight: true },
          { value: String(round), label: 'ROUNDS' },
        ]}
        meters={[
          {
            label: 'Accuracy this match',
            percent: salvoAccuracy(record),
            accent: true,
          },
          ...(winRate === null || winRate === undefined
            ? []
            : [{ label: 'Your win rate', percent: winRate }]),
        ]}
        settlement={settlement}
        onBack={onBack}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  return (
    <div className="salvo-play">
      <div className="salvo-stage">
        <div className="salvo-hud">
          <HullBar seat={mine} label="You" mine />
          <div className="salvo-wind">
            <span className="card-label">WIND</span>
            <span className="salvo-wind-value">
              {wind === 0 ? (
                'CALM'
              ) : (
                <>
                  {wind > 0 ? (
                    <ArrowRight size={13} weight="bold" />
                  ) : (
                    <ArrowLeft size={13} weight="bold" />
                  )}
                  {Math.abs(wind)}
                </>
              )}
            </span>
          </div>
          <HullBar seat={foe} label={foe?.name ?? 'Opponent'} align="right" />
        </div>

        <div className="salvo-field-box">
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

          <div className="salvo-overlay salvo-shot-count">
            <span className="card-label">SHOT</span>
            <span className="salvo-shot-value">
              {shotNumber} · R{round}
            </span>
          </div>

          {(notice || damage) && (
            <div className="salvo-overlay salvo-notice">
              <Crosshair size={14} weight="fill" color="var(--lime)" />
              {notice ?? ''}
              {damage?.hits.map(hit => (
                <span
                  key={`${hit.side}-${hit.amount}`}
                  className="salvo-damage"
                  style={{
                    color: hit.side === me ? 'var(--loss)' : 'var(--win)',
                  }}
                >
                  -{hit.amount}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside className="salvo-side">
        <div className={myTurn ? 'match-turn' : 'match-turn is-theirs'}>
          <span className="match-turn-label">
            <span className="turn-dot" />
            {myTurn ? 'YOUR TURN' : 'THEIR TURN'}
          </span>
          {turnDeadline ? (
            <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
          ) : (
            <span className="mono bs-clock-value">--</span>
          )}
        </div>

        <Dial
          label="ANGLE"
          value={mine?.angle ?? 0}
          unit="°"
          hint={`${SALVO_MIN_ANGLE}° to ${SALVO_MAX_ANGLE}°`}
          min={SALVO_MIN_ANGLE}
          max={SALVO_MAX_ANGLE}
          disabled={!armed}
          onStep={delta => onAim({ angle: (mine?.angle ?? 0) + delta * STEP.angle })}
          onSet={angle => onAim({ angle })}
        />

        <Dial
          label="POWER"
          value={mine?.power ?? 0}
          hint={`${SALVO_MIN_POWER} to ${SALVO_MAX_POWER}`}
          min={SALVO_MIN_POWER}
          max={SALVO_MAX_POWER}
          disabled={!armed}
          onStep={delta => onAim({ power: (mine?.power ?? 0) + delta * STEP.power })}
          onSet={power => onAim({ power })}
        />

        <div className="sunken-card">
          <div className="salvo-drive-head">
            <span className="card-label">DRIVE</span>
            <span className="seg-pips">
              {Array.from({ length: DRIVE_PIPS }, (_, i) => (
                <span
                  key={i}
                  className={
                    i < Math.round((movesLeft / SALVO_MOVE_RANGE) * DRIVE_PIPS)
                      ? 'seg-pip is-on'
                      : 'seg-pip'
                  }
                />
              ))}
              <span className="salvo-drive-left">{Math.round(movesLeft)} left</span>
            </span>
          </div>
          <div className="salvo-drive-row">
            <button
              type="button"
              className="salvo-drive-btn"
              disabled={!armed || movesLeft <= 0}
              onClick={() => onMove(-1)}
            >
              <CaretLeft size={14} weight="bold" />
              Left
            </button>
            <button
              type="button"
              className="salvo-drive-btn"
              disabled={!armed || movesLeft <= 0}
              onClick={() => onMove(1)}
            >
              Right
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        </div>

        <div className="match-actions">
          <button
            type="button"
            className="fire-btn"
            disabled={!armed}
            onClick={onFire}
          >
            <Crosshair size={19} weight="fill" />
            {armed ? 'Fire' : myTurn ? 'Driving' : 'Waiting'}
            <span className="fire-key">SPACE</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function HullBar({
  seat,
  label,
  align = 'left',
  mine = false,
}: {
  seat: { hp: number; initial: string; side: SalvoSide } | undefined;
  label: string;
  align?: 'left' | 'right';
  mine?: boolean;
}) {
  const hp = Math.max(0, seat?.hp ?? 0);
  const name = <span className="salvo-hull-name player-name">{label}</span>;
  const value = (
    <span className={mine ? 'salvo-hp-value is-me' : 'salvo-hp-value'}>{hp}</span>
  );

  return (
    <div className={align === 'right' ? 'salvo-hull is-right' : 'salvo-hull'}>
      <span
        className={
          seat?.side === SalvoSide.Left ? 'seat-avatar is-me' : 'seat-avatar'
        }
      >
        {seat?.initial ?? '?'}
      </span>
      <div className="salvo-hull-body">
        <div className="salvo-hull-head">
          {name}
          {value}
        </div>
        <div className="salvo-hp-track">
          <span
            className="salvo-hp-fill"
            style={{
              transform: `scaleX(${hp / 100})`,
              background: mine ? 'var(--lime)' : 'var(--text-3)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Dial({
  label,
  value,
  unit,
  hint,
  min,
  max,
  disabled,
  onStep,
  onSet,
}: {
  label: string;
  value: number;
  unit?: string;
  hint: string;
  min: number;
  max: number;
  disabled: boolean;
  onStep: (delta: -1 | 1) => void;
  onSet: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = `${Math.min(1, Math.max(0, (value - min) / (max - min))) * 100}%`;

  function scrub(clientX: number) {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const t = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    onSet(Math.round(min + t * (max - min)));
  }

  return (
    <div className="sunken-card">
      <div className="dial-head">
        <span className="card-label">{label}</span>
        <span className="dial-value">
          {value}
          {unit && <span className="dial-unit">{unit}</span>}
        </span>
      </div>
      <div
        className="dial-slider"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label.toLowerCase()}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={event => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub(event.clientX);
        }}
        onPointerMove={event => {
          if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          scrub(event.clientX);
        }}
        onKeyDown={event => {
          if (disabled) return;
          if (event.key === 'ArrowLeft') onStep(-1);
          else if (event.key === 'ArrowRight') onStep(1);
          else return;
          event.preventDefault();
        }}
      >
        <div className="dial-track" ref={trackRef}>
          <span className="dial-fill" style={{ width: pct }} />
          <span className="dial-knob" style={{ left: pct }} />
        </div>
      </div>
      <div className="stepper-row">
        <button
          type="button"
          className="stepper-btn"
          disabled={disabled}
          onClick={() => onStep(-1)}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus size={15} weight="bold" />
        </button>
        <span className="stepper-hint">{hint}</span>
        <button
          type="button"
          className="stepper-btn"
          disabled={disabled}
          onClick={() => onStep(1)}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}
