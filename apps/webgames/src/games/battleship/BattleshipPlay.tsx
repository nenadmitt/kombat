import {
  bombCells,
  CHARGE_BAR_MAX,
  FLEET,
  GRID,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  sunkShipIds,
  type FireKind,
  type PowerupKind,
} from '@gaming-platform/core';
import type { Icon } from '@phosphor-icons/react';
import { Anchor, Bomb, Crosshair, RocketLaunch } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { BattleshipBoard } from './BattleshipBoard';
import { GameResultScreen } from '../../components/GameResultScreen';
import type { BattleshipPlayProps } from './battleship-engine';
import type { ResultExtras } from '../use-result-data';
import { COLUMN_LABELS, ROW_LABELS } from './battleship-theme';
import { Countdown } from './Countdown';

type View = 'attack' | 'fleet';

const RESULT_COPY: Record<
  'win' | 'lose',
  Record<
    NonNullable<BattleshipPlayProps['resultReason']>,
    { eyebrow: string; message: (name: string) => string }
  >
> = {
  win: {
    complete: {
      eyebrow: 'FLEET DESTROYED',
      message: () => 'You sank every enemy ship and dominated the waters.',
    },
    forfeit: {
      eyebrow: 'OPPONENT FORFEITED',
      message: name => `${name} abandoned the battle. The seas are yours.`,
    },
    timeout: {
      eyebrow: 'VICTORY BY TIMEOUT',
      message: name => `${name} ran out of time once too often. The win is yours.`,
    },
    'setup-timeout': {
      eyebrow: 'OPPONENT NEVER DEPLOYED',
      message: name => `${name} failed to deploy their fleet in time. The win is yours.`,
    },
  },
  lose: {
    complete: {
      eyebrow: 'FLEET LOST',
      message: () => 'Your fleet was wiped out. Regroup and strike back.',
    },
    forfeit: {
      eyebrow: 'MATCH FORFEITED',
      message: () => 'You forfeited the match and handed over the win.',
    },
    timeout: {
      eyebrow: 'LOST BY TIMEOUT',
      message: () => 'You ran out of time once too often and forfeited the match.',
    },
    'setup-timeout': {
      eyebrow: 'FLEET NEVER DEPLOYED',
      message: () => "You didn't deploy your fleet in time, so the match was forfeited.",
    },
  },
};

/** Long enough that the shot which ended the turn is still on screen. */
const VIEW_SWITCH_DELAY_MS = 1500;

const POWERUPS: {
  kind: PowerupKind;
  label: string;
  blurb: string;
  icon: Icon;
}[] = [
  {
    kind: 'torpedo',
    label: 'Torpedo',
    blurb: 'Runs a whole row until it strikes',
    icon: RocketLaunch,
  },
  { kind: 'bomb', label: 'Bomb', blurb: 'Hits a 3x3 block', icon: Bomb },
];

export function BattleshipPlay(props: BattleshipPlayProps & ResultExtras) {
  const {
    onBack,
    onPlayAgain,
    myFleet,
    myMines,
    myShots,
    opponentShots,
    revealedEnemyShips,
    points,
    powerupsUsed,
    myTurn,
    action,
    opponentAction,
    opponent,
    sunkByMe,
    sunkByOpponent,
    turnDeadline,
    myOnline,
    opponentOnline,
    result,
    onFire,
    onTimerExpire,
  } = props;

  const [view, setView] = useState<View>('attack');
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [armed, setArmed] = useState<PowerupKind | null>(null);

  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setArmed(null);
    }
  }, [myTurn]);

  // The switch lags a beat so the shot that ended the turn is still visible.
  useEffect(() => {
    const timer = setTimeout(
      () => setView(myTurn ? 'attack' : 'fleet'),
      VIEW_SWITCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [myTurn]);

  const opponentActionId = opponentAction?.id;
  const opponentActionKind = opponentAction?.kind;
  useEffect(() => {
    if (opponentActionKind === 'mine') setView('fleet');
  }, [opponentActionId, opponentActionKind]);

  const actionId = action?.id;
  const actionKind = action?.kind;
  useEffect(() => {
    if (actionKind === 'mine') setView('attack');
  }, [actionId, actionKind]);

  const firedAt = useMemo(
    () => new Set(myShots.map(s => `${s.row},${s.col}`)),
    [myShots],
  );

  const sunkMine = useMemo(() => {
    const fleet = Object.fromEntries(
      myFleet.map(ship => [ship.id, ship.placement]),
    );
    return sunkShipIds(fleet, opponentShots);
  }, [myFleet, opponentShots]);

  const revealedIds = useMemo(
    () => new Set(revealedEnemyShips.map(ship => ship.id)),
    [revealedEnemyShips],
  );

  // Shows the whole row: stopping where it would hit leaks the enemy's position.
  const highlight = useMemo(() => {
    if (!selected || !armed) return [];
    if (armed === 'torpedo') {
      return Array.from({ length: GRID }, (_, col) => ({ row: selected.row, col }));
    }
    return bombCells(selected.row, selected.col, {}).map(cell => ({
      row: cell.row,
      col: cell.col,
    }));
  }, [selected, armed]);

  function fire() {
    if (!selected || !myTurn) return;
    onFire((armed ?? 'single') as FireKind, selected.row, selected.col);
    setSelected(null);
    setArmed(null);
  }

  const canFire = Boolean(myTurn && selected);
  useEffect(() => {
    if (!canFire || !selected) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || target?.closest('input, textarea, button')) {
        return;
      }
      event.preventDefault();
      onFire((armed ?? 'single') as FireKind, selected!.row, selected!.col);
      setSelected(null);
      setArmed(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canFire, selected, armed, onFire]);

  if (result) {
    return <BattleshipResult {...props} />;
  }

  const attacking = view === 'attack';
  const targetLabel = selected
    ? `${COLUMN_LABELS[selected.col]}${selected.row + 1}`
    : null;
  const hint = !attacking
    ? 'Incoming fire'
    : !myTurn
      ? "Opponent's turn"
      : armed === 'torpedo'
        ? 'Pick a row, then Fire'
        : armed === 'bomb'
          ? 'Pick an area, then Fire'
          : 'Pick a cell to target';

  return (
    <div className="bs-play">
      <div className="bs-board-col">
        <div className="bs-grid-heading">
          <div className="bs-toggle">
            <button
              type="button"
              className={attacking ? 'bs-toggle-opt is-active' : 'bs-toggle-opt'}
              onClick={() => setView('attack')}
            >
              <Crosshair size={14} weight="fill" />
              Enemy waters
            </button>
            <button
              type="button"
              className={attacking ? 'bs-toggle-opt' : 'bs-toggle-opt is-active'}
              onClick={() => setView('fleet')}
            >
              <Anchor size={14} />
              My fleet
            </button>
          </div>

          <span className={selected ? 'bs-target' : 'bs-target is-idle'}>
            <Crosshair size={13} weight="bold" />
            {selected ? `Target ${targetLabel}` : hint}
          </span>
        </div>

        <div className="bs-grid-wrap">
          <div className="bs-corner" />
          <div className="bs-col-labels">
            {COLUMN_LABELS.map(label => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="bs-row-labels">
            {ROW_LABELS.map(label => (
              <span key={label}>{label}</span>
            ))}
          </div>
          {attacking ? (
            <BattleshipBoard
              ships={revealedEnemyShips}
              shots={myShots}
              sunkShipIds={revealedIds}
              selected={selected}
              highlight={highlight}
              interactive={myTurn}
              action={action}
              onCommit={(row, col) => {
                if (!myTurn || firedAt.has(`${row},${col}`)) return;
                setSelected({ row, col });
              }}
            />
          ) : (
            <BattleshipBoard
              ships={myFleet}
              mines={myMines}
              shots={opponentShots}
              sunkShipIds={sunkMine}
              action={opponentAction}
            />
          )}
        </div>

        <div className="bs-legend">
          <span className="bs-legend-item">
            <span
              className="bs-legend-swatch"
              style={{ background: 'rgba(255, 84, 104, 0.45)' }}
            />
            Hit
          </span>
          <span className="bs-legend-item">
            <span
              className="bs-legend-swatch"
              style={{ boxShadow: 'inset 0 0 0 1px var(--text-4)' }}
            />
            Miss
          </span>
          <span className="bs-legend-item">
            <span
              className="bs-legend-swatch"
              style={{ boxShadow: 'inset 0 0 0 2px var(--lime)' }}
            />
            Selected
          </span>
        </div>
      </div>

      <aside className="bs-side">
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

        <div className="sunken-card bs-scores">
          <Player
            name="You"
            initial="Y"
            online={myOnline}
            sunk={sunkByOpponent}
            mine
          />
          <Player
            name={opponent.name}
            initial={opponent.initial}
            online={opponentOnline}
            sunk={sunkByMe}
          />
        </div>

        <div className="sunken-card">
          <div className="bs-charge">
            <span className="card-label">SPECIAL CHARGE</span>
            <span
              className="mono"
              style={{ fontWeight: 700, fontSize: 12, color: 'var(--lime)' }}
            >
              {points} / {CHARGE_BAR_MAX}
            </span>
          </div>
          <div className="bs-charge-track">
            <span
              className="bs-charge-fill"
              style={{
                transform: `scaleX(${Math.min(points / CHARGE_BAR_MAX, 1)})`,
              }}
            />
          </div>

          <div className="bs-powerups">
            {POWERUPS.map(({ kind, label, blurb, icon: Glyph }) => {
              const left = POWERUP_MAX_USES - powerupsUsed[kind];
              const usable = points >= POWERUP_COSTS[kind] && left > 0;
              return (
                <button
                  key={kind}
                  type="button"
                  className={armed === kind ? 'bs-powerup is-armed' : 'bs-powerup'}
                  disabled={!usable || !myTurn}
                  onClick={() => setArmed(current => (current === kind ? null : kind))}
                  title={blurb}
                >
                  <span className="bs-powerup-head">
                    <Glyph
                      size={16}
                      weight="fill"
                      color={usable ? 'var(--lime)' : 'var(--text-4)'}
                    />
                    <span className="bs-powerup-name">{label}</span>
                  </span>
                  <span className="bs-powerup-status">
                    {usable
                      ? `Ready · ${left} left`
                      : left === 0
                        ? 'Spent'
                        : `${POWERUP_COSTS[kind]} charge · ${left} left`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="match-actions">
          <button
            type="button"
            className="fire-btn"
            disabled={!myTurn || !selected}
            onClick={fire}
          >
            <Crosshair size={19} weight="fill" />
            {selected ? `Fire at ${targetLabel}` : myTurn ? 'Pick a target' : 'Waiting'}
            <span className="fire-key">SPACE</span>
          </button>

          {selected && (
            <div className="ghost-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setSelected(null);
                  setArmed(null);
                }}
              >
                Clear target
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Player({
  name,
  initial,
  online,
  sunk,
  mine = false,
}: {
  name: string;
  initial: string;
  online: boolean;
  sunk: number;
  mine?: boolean;
}) {
  return (
    <div className="bs-player">
      <span className={mine ? 'seat-avatar is-me' : 'seat-avatar'}>
        {initial}
        <span
          className="presence-dot"
          style={{ background: online ? 'var(--win)' : 'var(--loss)' }}
        />
      </span>
      <span className="bs-player-name">{name}</span>
      <span className="hull-pips">
        {FLEET.map((ship, index) => (
          <span
            key={ship.id}
            className="hull-pip"
            style={index < sunk ? { background: 'var(--loss)' } : undefined}
          />
        ))}
      </span>
      <span className="bs-player-count">
        {sunk}/{FLEET.length}
      </span>
    </div>
  );
}

function BattleshipResult({
  result,
  resultReason,
  volleys,
  sunkByMe,
  opponent,
  onBack,
  onPlayAgain,
  settlement,
  winRate,
}: BattleshipPlayProps & ResultExtras) {
  const won = result === 'win';
  // A volley counts as a hit when any cell struck a ship, so splash misses don't drag accuracy down.
  const accuracy = volleys.fired
    ? Math.round((volleys.hit / volleys.fired) * 100)
    : 0;
  const copy = RESULT_COPY[won ? 'win' : 'lose'][resultReason ?? 'complete'];

  return (
    <GameResultScreen
      variant={won ? 'win' : 'lose'}
      eyebrow={copy.eyebrow}
      title={won ? 'Victory' : 'Defeat'}
      message={copy.message(opponent.name)}
      opponent={{
        initial: opponent.initial,
        label: won ? 'DEFEATED' : 'LOST TO',
        name: opponent.name,
      }}
      stats={[
        { value: String(volleys.fired), label: 'SHOTS FIRED' },
        { value: String(volleys.hit), label: 'HITS LANDED', highlight: true },
        {
          value: `${sunkByMe} / ${FLEET.length}`,
          label: 'SHIPS SUNK',
          highlight: true,
        },
      ]}
      meters={[
        { label: 'Accuracy this match', percent: accuracy, accent: true },
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
