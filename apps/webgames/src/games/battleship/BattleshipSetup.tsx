import {
  buildOccupied,
  canPlace,
  cellsFor,
  FLEET,
  MINES_PER_PLAYER,
  randomFleet,
  randomMines,
  type FleetPlacements,
  type MinePlacement,
  type Orientation,
} from '@gaming-platform/core';
import { ArrowsClockwise, Shuffle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { BattleshipBoard } from './BattleshipBoard';
import { toPlacedShips } from './battleship-view';
import {
  COLUMN_LABELS,
  MINE_COLOR,
  ROW_LABELS,
  SHIPS,
} from './battleship-theme';
import { ShipHull } from './ShipHull';
import { Countdown } from './Countdown';

/** Pseudo tray id: mines share the placement flow but are not a ship. */
const MINES_ID = 'mines';

const TOTAL_PIECES = FLEET.length + MINES_PER_PLAYER;

type Props = {
  onReady: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  /** Epoch ms the fleet must be in by, or null when nothing is racing. */
  deadline: number | null;
};

export function BattleshipSetup({ onReady, deadline }: Props) {
  const [placements, setPlacements] = useState<FleetPlacements>({});
  const [mines, setMines] = useState<MinePlacement[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const placedCount = Object.keys(placements).length + mines.length;
  const ready = placedCount === TOTAL_PIECES;

  // Auto-advance the tray: whatever the player has not placed yet is next.
  const activeId =
    selectedId ??
    SHIPS.find(ship => !placements[ship.id])?.id ??
    (mines.length < MINES_PER_PLAYER ? MINES_ID : null);

  const activeShip = activeId && activeId !== MINES_ID ? SHIPS.find(s => s.id === activeId) : null;

  // Ships and mines block each other, so one occupancy set covers both.
  const occupied = useMemo(() => {
    const set = buildOccupied(placements);
    for (const mine of mines) set.add(`${mine.row},${mine.col}`);
    return set;
  }, [placements, mines]);

  function isValidPlacement(row: number, col: number): boolean {
    if (activeId === MINES_ID) {
      return !occupied.has(`${row},${col}`);
    }
    if (!activeShip) return false;
    return canPlace(
      cellsFor({ row, col, orientation }, activeShip.size),
      occupied,
    );
  }

  function commit(row: number, col: number, isTap: boolean) {
    // A tap on an existing piece picks it back up. A drag-release never
    // removes: a missed drop would silently delete a placed ship.
    if (isTap) {
      const hitMine = mines.find(m => m.row === row && m.col === col);
      if (hitMine) {
        setMines(prev => prev.filter(m => m !== hitMine));
        setSelectedId(MINES_ID);
        return;
      }
      const hitShip = SHIPS.find(ship => {
        const placement = placements[ship.id];
        return (
          placement &&
          cellsFor(placement, ship.size).some(c => c.r === row && c.c === col)
        );
      });
      if (hitShip) {
        setPlacements(prev => {
          const next = { ...prev };
          delete next[hitShip.id];
          return next;
        });
        setSelectedId(hitShip.id);
        return;
      }
    }

    if (!isValidPlacement(row, col)) return;

    if (activeId === MINES_ID) {
      setMines(prev => [...prev, { row, col }]);
      setSelectedId(null);
      return;
    }
    if (activeShip) {
      setPlacements(prev => ({
        ...prev,
        [activeShip.id]: { row, col, orientation },
      }));
      setSelectedId(null);
    }
  }

  function autoPlace() {
    const fleet = randomFleet();
    setPlacements(fleet);
    setMines(randomMines(fleet));
    setSelectedId(null);
  }

  return (
    <div className="bs-setup">
      <div className="bs-setup-board">
        <div className="bs-head">
          <div>
            <span className="card-label">DEPLOY YOUR FLEET</span>
            <h2 className="page-title" style={{ marginTop: 'var(--s-2)' }}>
              {activeId === MINES_ID
                ? 'Arm your mines'
                : activeShip
                  ? `Place the ${activeShip.label}`
                  : 'Fleet ready'}
            </h2>
          </div>
          {deadline && <Countdown deadline={deadline} label="TO DEPLOY" />}
        </div>

        <div className="bs-progress">
          <div className="bs-progress-track">
            <span
              className="bs-progress-fill"
              style={{ transform: `scaleX(${placedCount / TOTAL_PIECES})` }}
            />
          </div>
          <span className="card-label">
            {placedCount}/{TOTAL_PIECES} PLACED
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
          <BattleshipBoard
            ships={toPlacedShips(placements)}
            mines={mines}
            shots={[]}
            interactive
            onCommit={commit}
            preview={
              activeShip
                ? {
                    size: activeShip.size,
                    color: activeShip.color,
                    orientation,
                  }
                : null
            }
            isPreviewValid={isValidPlacement}
          />
        </div>
      </div>

      <aside className="bs-tray">
        <button
          type="button"
          className="btn btn-surface btn-block"
          onClick={() => setOrientation(o => (o === 'h' ? 'v' : 'h'))}
          disabled={activeId === MINES_ID || !activeShip}
        >
          <ArrowsClockwise size={16} color="var(--lime)" />
          {orientation === 'h' ? 'Horizontal' : 'Vertical'}
        </button>

        <div className="bs-tray-list">
          {SHIPS.map(ship => {
            const placed = Boolean(placements[ship.id]);
            return (
              <button
                key={ship.id}
                type="button"
                className={
                  activeId === ship.id
                    ? 'bs-card is-active'
                    : placed
                      ? 'bs-card is-placed'
                      : 'bs-card'
                }
                onClick={() => setSelectedId(ship.id)}
              >
                <span className="bs-card-head">
                  <span className="bs-card-name">{ship.label}</span>
                  <span className="card-label">{ship.size}</span>
                </span>
                <svg
                  width="100%"
                  height={14}
                  viewBox={`0 0 ${ship.size * 14} 14`}
                  aria-hidden
                >
                  <ShipHull
                    length={ship.size * 14}
                    thickness={14}
                    cells={ship.size}
                    color={placed ? 'var(--text-4)' : ship.color}
                  />
                </svg>
              </button>
            );
          })}

          <button
            type="button"
            className={
              activeId === MINES_ID
                ? 'bs-card is-active'
                : mines.length === MINES_PER_PLAYER
                  ? 'bs-card is-placed'
                  : 'bs-card'
            }
            onClick={() => setSelectedId(MINES_ID)}
          >
            <span className="bs-card-head">
              <span className="bs-card-name">Sea mines</span>
              <span className="card-label">
                {mines.length}/{MINES_PER_PLAYER}
              </span>
            </span>
            <span className="bs-mine-row">
              {Array.from({ length: MINES_PER_PLAYER }, (_, i) => (
                <span
                  key={i}
                  className="bs-mine-dot"
                  style={{
                    background: i < mines.length ? 'var(--text-4)' : MINE_COLOR,
                  }}
                />
              ))}
            </span>
          </button>
        </div>

        <p className="bs-hint">
          Tap a placed ship to pick it back up. Mines damage whoever strikes
          them, so keep them off your own hulls.
        </p>

        <button type="button" className="btn btn-surface btn-block" onClick={autoPlace}>
          <Shuffle size={16} color="var(--lime)" />
          Auto-place
        </button>
        <button
          type="button"
          className="btn btn-lime btn-block btn-lg"
          disabled={!ready}
          onClick={() => onReady(placements, mines)}
        >
          {ready ? 'Ready' : `${TOTAL_PIECES - placedCount} left to place`}
        </button>
      </aside>
    </div>
  );
}
