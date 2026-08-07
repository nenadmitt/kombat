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
import { Crosshair, Target } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { BattleshipBoard } from './BattleshipBoard';
import type { BattleshipPlayProps } from './battleship-engine';
import { COLUMN_LABELS, ROW_LABELS } from './battleship-theme';
import { Countdown } from './Countdown';

type View = 'attack' | 'fleet';

const POWERUPS: { kind: PowerupKind; label: string; blurb: string }[] = [
  { kind: 'torpedo', label: 'Torpedo', blurb: 'Runs a whole row until it strikes' },
  { kind: 'bomb', label: 'Bomb', blurb: 'Hits a 3x3 block' },
];

export function BattleshipPlay(props: BattleshipPlayProps) {
  const {
    myFleet,
    myMines,
    myShots,
    opponentShots,
    revealedEnemyShips,
    points,
    powerupsUsed,
    myTurn,
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

  // A turn that is no longer mine cannot keep a target locked in.
  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setArmed(null);
    }
  }, [myTurn]);

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

  /**
   * The torpedo preview deliberately shows the whole row rather than where it
   * would stop: stopping early would leak the enemy's position.
   */
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

  function canArm(kind: PowerupKind): boolean {
    return points >= POWERUP_COSTS[kind] && powerupsUsed[kind] < POWERUP_MAX_USES;
  }

  function fire() {
    if (!selected || !myTurn) return;
    const kind: FireKind = armed ?? 'single';
    onFire(kind, selected.row, selected.col);
    setSelected(null);
    setArmed(null);
  }

  if (result) return <BattleshipResult {...props} />;

  const attacking = view === 'attack';

  return (
    <div className="bs-play">
      <div className="bs-players">
        <Player
          name="You"
          initial="Y"
          online={myOnline}
          sunk={sunkByOpponent}
          mine
        />
        <div className="bs-turn">
          {turnDeadline ? (
            <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
          ) : (
            <span className="mono bs-clock-value">--</span>
          )}
          <span className="stat-label">
            {myTurn ? 'YOUR MOVE' : `${opponent.name.toUpperCase()} IS AIMING`}
          </span>
        </div>
        <Player
          name={opponent.name}
          initial={opponent.initial}
          online={opponentOnline}
          sunk={sunkByMe}
        />
      </div>

      <div className="bs-view-toggle">
        <button
          type="button"
          className={attacking ? 'pill is-active' : 'pill'}
          onClick={() => setView('attack')}
        >
          <Crosshair size={13} weight="bold" /> Their waters
        </button>
        <button
          type="button"
          className={attacking ? 'pill' : 'pill is-active'}
          onClick={() => setView('fleet')}
        >
          <Target size={13} weight="bold" /> Your fleet
        </button>
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
          />
        )}
      </div>

      {attacking && (
        <>
          <div className="bs-charge">
            <span className="card-label">CHARGE</span>
            <div className="bs-charge-track">
              <span
                className="bs-charge-fill"
                style={{
                  transform: `scaleX(${Math.min(points / CHARGE_BAR_MAX, 1)})`,
                }}
              />
            </div>
            <span className="mono" style={{ color: 'var(--lime)' }}>
              {points}
            </span>
          </div>

          <div className="bs-powerups">
            {POWERUPS.map(({ kind, label, blurb }) => {
              const usable = canArm(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  className={armed === kind ? 'bs-powerup is-armed' : 'bs-powerup'}
                  disabled={!usable || !myTurn}
                  onClick={() => setArmed(current => (current === kind ? null : kind))}
                  title={blurb}
                >
                  <span className="bs-powerup-name">{label}</span>
                  <span className="card-label">
                    {POWERUP_COSTS[kind]} charge ·{' '}
                    {POWERUP_MAX_USES - powerupsUsed[kind]} left
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            disabled={!myTurn || !selected}
            onClick={fire}
          >
            {selected
              ? `Fire ${armed ?? ''} at ${COLUMN_LABELS[selected.col]}${selected.row + 1}`.replace(
                  '  ',
                  ' ',
                )
              : myTurn
                ? 'Pick a target'
                : 'Waiting for your turn'}
          </button>
        </>
      )}
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
    <div className={mine ? 'bs-player' : 'bs-player is-right'}>
      <span className={mine ? 'seat-avatar is-me' : 'seat-avatar'}>
        {initial}
        <span
          className="presence-dot"
          style={{ background: online ? 'var(--win)' : 'var(--loss)' }}
        />
      </span>
      <div>
        <div className="player-name">{name}</div>
        <div className="stat-label">
          {sunk}/{FLEET.length} SUNK
        </div>
      </div>
    </div>
  );
}

function BattleshipResult({
  result,
  resultReason,
  volleys,
  sunkByMe,
}: BattleshipPlayProps) {
  const won = result === 'win';
  const accuracy = volleys.fired
    ? Math.round((volleys.hit / volleys.fired) * 100)
    : 0;

  const reason =
    resultReason === 'forfeit'
      ? won
        ? 'They forfeited'
        : 'You forfeited'
      : resultReason === 'timeout'
        ? won
          ? 'They ran out of time'
          : 'You ran out of time'
        : resultReason === 'setup-timeout'
          ? 'A fleet was never deployed'
          : won
            ? 'Enemy fleet destroyed'
            : 'Your fleet was destroyed';

  return (
    <div className="bs-play">
      <div className="arena-body">
        <div
          style={{
            fontWeight: 800,
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: '-0.035em',
            color: won ? 'var(--win)' : 'var(--loss)',
          }}
        >
          {won ? 'Victory' : 'Defeat'}
        </div>
        <span className="card-label">{reason.toUpperCase()}</span>
        <div style={{ display: 'flex', gap: 'var(--s-8)', marginTop: 'var(--s-4)' }}>
          <Stat value={`${sunkByMe}/${FLEET.length}`} label="SHIPS SUNK" />
          <Stat value={String(volleys.fired)} label="VOLLEYS" />
          <Stat value={`${accuracy}%`} label="ACCURACY" />
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
