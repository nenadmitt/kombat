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
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowRight,
  CheckCircle,
  CursorClick,
  Shuffle,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { BattleshipBoard } from './BattleshipBoard';
import { toPlacedShips } from './battleship-view';
import {
  COLUMN_LABELS,
  MINE_COLOR,
  ROW_LABELS,
  SHIPS,
} from './battleship-theme';
import { Countdown } from './Countdown';

/** Pseudo tray id: mines share the placement flow but are not a ship. */
const MINES_ID = 'mines';

const TOTAL_PIECES = FLEET.length + MINES_PER_PLAYER;

type Props = {
  onReady: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  deadline: number | null;
};

export function BattleshipSetup({ onReady, deadline }: Props) {
  const [placements, setPlacements] = useState<FleetPlacements>({});
  const [mines, setMines] = useState<MinePlacement[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const placedCount = Object.keys(placements).length + mines.length;
  const ready = placedCount === TOTAL_PIECES;

  const activeId =
    selectedId ??
    SHIPS.find(ship => !placements[ship.id])?.id ??
    (mines.length < MINES_PER_PLAYER ? MINES_ID : null);

  const activeShip = activeId && activeId !== MINES_ID ? SHIPS.find(s => s.id === activeId) : null;

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
    // A drag-release never removes: a missed drop would silently delete a placed ship.
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

  function clearAll() {
    setPlacements({});
    setMines([]);
    setSelectedId(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'r' && event.key !== 'R') return;
      if (target?.closest('input, textarea')) return;
      setOrientation(o => (o === 'h' ? 'v' : 'h'));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          <div className="bs-head-progress">
            {deadline && <Countdown deadline={deadline} label="TO DEPLOY" />}
            <span className="bs-placed-count">
              {placedCount}
              <span style={{ color: 'var(--text-4)' }}> / {TOTAL_PIECES}</span>
            </span>
            <span className="seg-pips">
              {Array.from({ length: TOTAL_PIECES }, (_, i) => (
                <span
                  key={i}
                  className={i < placedCount ? 'seg-pip is-on' : 'seg-pip'}
                />
              ))}
            </span>
          </div>
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

        <p className="bs-hint bs-legend-item">
          <CursorClick size={14} color="var(--lime)" />
          Click a cell to drop the piece · click a placed one to pick it back up
        </p>
      </div>

      <aside className="bs-tray">
        <div className="match-actions is-top">
          <button
            type="button"
            className="fire-btn"
            disabled={!ready}
            onClick={() => onReady(placements, mines)}
          >
            {ready ? 'Ready' : `Place ${TOTAL_PIECES - placedCount} more to start`}
          </button>
          <div className="ghost-row">
            <button
              type="button"
              className="ghost-btn is-lime"
              onClick={autoPlace}
            >
              <Shuffle size={14} weight="bold" />
              Auto-place
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={placedCount === 0}
              onClick={clearAll}
            >
              <ArrowCounterClockwise size={14} />
              Clear
            </button>
          </div>
        </div>

        <div>
          <span className="card-label">ORIENTATION</span>
          <div className="segmented is-block" style={{ marginTop: 'var(--s-3)' }}>
            <button
              type="button"
              className={orientation === 'h' ? 'seg-opt is-active' : 'seg-opt'}
              onClick={() => setOrientation('h')}
            >
              <ArrowRight size={14} weight="bold" />
              Horizontal
            </button>
            <button
              type="button"
              className={orientation === 'v' ? 'seg-opt is-active' : 'seg-opt'}
              onClick={() => setOrientation('v')}
            >
              <ArrowDown size={14} weight="bold" />
              Vertical
            </button>
          </div>
          <p className="bs-hint" style={{ marginTop: 'var(--s-3)', textAlign: 'center' }}>
            Press <span className="key-cap">R</span> to rotate
          </p>
        </div>

        <div>
          <span className="card-label">FLEET</span>
          <div className="bs-tray-list" style={{ marginTop: 'var(--s-3)' }}>
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
                  <span className="bs-card-body">
                    <span className="bs-card-head">
                      <span className="bs-card-name">{ship.label}</span>
                      {placed && (
                        <CheckCircle size={14} weight="fill" color="var(--lime)" />
                      )}
                    </span>
                    <span className="bs-cells">
                      {Array.from({ length: ship.size }, (_, i) => (
                        <span
                          key={i}
                          className="bs-cell-dot"
                          style={{
                            background: placed ? 'var(--text-4)' : ship.color,
                          }}
                        />
                      ))}
                    </span>
                  </span>
                  <span className="bs-card-size">{ship.size}</span>
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
              <span className="bs-card-body">
                <span className="bs-card-head">
                  <span className="bs-card-name">Mines</span>
                  {mines.length === MINES_PER_PLAYER && (
                    <CheckCircle size={14} weight="fill" color="var(--lime)" />
                  )}
                </span>
                <span className="bs-mine-row">
                  {Array.from({ length: MINES_PER_PLAYER }, (_, i) => (
                    <span
                      key={i}
                      className="bs-mine-dot"
                      style={{
                        background:
                          i < mines.length ? 'var(--text-4)' : MINE_COLOR,
                      }}
                    />
                  ))}
                </span>
              </span>
              <span className="bs-card-size">
                {mines.length}/{MINES_PER_PLAYER}
              </span>
            </button>
          </div>

          <p className="bs-hint" style={{ marginTop: 'var(--s-3)' }}>
            Mines damage whoever strikes them, so keep them off your own hulls.
          </p>
        </div>
      </aside>
    </div>
  );
}
