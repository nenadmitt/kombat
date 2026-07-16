import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BattleshipBot,
  FLEET,
  type FireKind,
  type FleetPlacements,
  MAX_TIMEOUTS,
  type MinePlacement,
  POINTS_PER_HIT,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  type PowerupKind,
  resolveFire,
  type Shot,
  type VolleyStats,
  mineBlastCells,
  sunkShipIds,
  TURN_SECONDS,
} from '@gaming-platform/core';

import type { GridAction } from '../BattleshipGrid';
import { OPPONENT_FLEET, OPPONENT_MINES } from './opponent-fleet';
import type { BattleshipEngine } from './battleship-engine';
import { toPlacedShips } from './battleship-view';

const BOT_MIN_DELAY = 3000;
const BOT_MAX_DELAY = 4000;
const TURN_MS = TURN_SECONDS * 1000;

/** Fresh cells only: `resolved` minus anything already in `prior`. */
function dedupe(resolved: Shot[], prior: Shot[]): Shot[] {
  const seen = new Set(prior.map(s => `${s.row},${s.col}`));
  return resolved.filter(s => !seen.has(`${s.row},${s.col}`));
}

/**
 * Single-player demo engine: resolves the player's shots locally against a
 * fixed enemy fleet (defended by enemy mines), and after each shot the bot
 * fires back after a 3–4s delay. Striking a mine sets off a 3x3 blast on the
 * striker's own board and ends their turn. The player has 30s per move; three
 * turn timeouts and they lose. No networking (both sides always "online").
 */
export function useDemoBattleship(): BattleshipEngine {
  const [phase, setPhase] = useState<'setup' | 'play'>('setup');
  const [myPlacements, setMyPlacements] = useState<FleetPlacements>({});
  const [myMines, setMyMines] = useState<MinePlacement[]>([]);
  const [botMines, setBotMines] = useState<MinePlacement[]>(OPPONENT_MINES);
  const [myShots, setMyShots] = useState<Shot[]>([]);
  const [botShots, setBotShots] = useState<Shot[]>([]);
  const [points, setPoints] = useState(0);
  const [powerupsUsed, setPowerupsUsed] = useState<Record<PowerupKind, number>>({
    torpedo: 0,
    bomb: 0,
  });
  const [volleys, setVolleys] = useState<VolleyStats>({ fired: 0, hit: 0 });
  const [turn, setTurn] = useState<'me' | 'bot'>('me');
  const [action, setAction] = useState<GridAction | null>(null);
  const [opponentAction, setOpponentAction] = useState<GridAction | null>(null);
  const botActionId = useRef(0);
  const [myTimeouts, setMyTimeouts] = useState(0);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const actionId = useRef(0);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bot = useRef(new BattleshipBot()).current;

  // Refs so the delayed bot callback reads current values.
  const myPlacementsRef = useRef(myPlacements);
  myPlacementsRef.current = myPlacements;
  const myMinesRef = useRef(myMines);
  myMinesRef.current = myMines;
  const myShotsRef = useRef(myShots);
  myShotsRef.current = myShots;
  const botShotsRef = useRef(botShots);
  botShotsRef.current = botShots;

  useEffect(
    () => () => {
      if (botTimer.current) {
        clearTimeout(botTimer.current);
      }
    },
    [],
  );

  const scheduleBotTurn = useCallback(() => {
    if (botTimer.current) {
      clearTimeout(botTimer.current);
    }
    const delay =
      BOT_MIN_DELAY + Math.floor(Math.random() * (BOT_MAX_DELAY - BOT_MIN_DELAY));
    botTimer.current = setTimeout(() => {
      const fleet = myPlacementsRef.current;
      const prevShots = botShotsRef.current;
      const mines = myMinesRef.current;

      const move = bot.decideMove(fleet, prevShots, mines);
      if (!move) {
        setTurn('me');
        setTurnStartedAt(Date.now());
        return;
      }

      const nextBotShots = [...prevShots, ...move.cells];
      setBotShots(nextBotShots);
      // Animate the bot's shot on my fleet view (bomb pop / single marker).
      botActionId.current += 1;
      setOpponentAction({
        id: botActionId.current,
        kind: move.kind,
        cells: move.cells,
      });

      // The bot struck my mine(s): each blast tears into the BOT's own board,
      // marking (and revealing) damage on my attack view - and always ends
      // the bot's turn.
      const struckMines = move.cells.filter(s => s.result === 'mine');
      let nextMyShots = myShotsRef.current;
      if (struckMines.length > 0) {
        setMyMines(prev =>
          prev.filter(
            m => !struckMines.some(s => s.row === m.row && s.col === m.col),
          ),
        );
        const blastCells: Shot[] = [];
        for (const cell of struckMines) {
          const blast = dedupe(
            mineBlastCells({ row: cell.row, col: cell.col }, OPPONENT_FLEET),
            [...nextMyShots, ...blastCells],
          );
          blastCells.push(...blast);
        }
        nextMyShots = [...nextMyShots, ...blastCells];
        setMyShots(nextMyShots);
        actionId.current += 1;
        setAction({ id: actionId.current, kind: 'mine', cells: blastCells });
        // The blast may have finished the bot's own fleet - player wins.
        if (sunkShipIds(OPPONENT_FLEET, nextMyShots).size === FLEET.length) {
          return;
        }
      }

      // Bot sank the whole fleet → game over (no more turns).
      if (sunkShipIds(fleet, nextBotShots).size === FLEET.length) {
        return;
      }
      // Any hit → bot fires again - unless it struck a mine, which always
      // hands the turn back. A wholly-missed shot returns the turn too.
      if (
        struckMines.length === 0 &&
        move.cells.some(s => s.result === 'hit')
      ) {
        scheduleBotTurn();
      } else {
        setTurn('me');
        setTurnStartedAt(Date.now());
      }
    }, delay);
  }, [bot]);

  const submitFleet = useCallback(
    (placements: FleetPlacements, mines: MinePlacement[]) => {
      bot.reset();
      setMyPlacements(placements);
      setMyMines(mines);
      setTurn('me');
      setTurnStartedAt(Date.now());
      setPhase('play');
    },
    [bot],
  );

  const onFire = useCallback(
    (kind: FireKind, row: number, col: number) => {
      if (turn !== 'me') {
        return;
      }
      if (
        kind !== 'single' &&
        (points < POWERUP_COSTS[kind] || powerupsUsed[kind] >= POWERUP_MAX_USES)
      ) {
        return;
      }
      const resolved = resolveFire(kind, row, col, OPPONENT_FLEET, botMines);
      const added = dedupe(resolved, myShots);
      if (added.length === 0) {
        return;
      }

      if (kind !== 'single') {
        setPoints(p => p - POWERUP_COSTS[kind]);
        setPowerupsUsed(prev => ({ ...prev, [kind]: prev[kind] + 1 }));
      }
      const hits = added.filter(s => s.result === 'hit').length;
      setPoints(p => p + hits * POINTS_PER_HIT);
      setVolleys(prev => ({
        fired: prev.fired + 1,
        hit: prev.hit + (hits > 0 ? 1 : 0),
      }));

      const nextShots = [...myShots, ...added];
      setMyShots(nextShots);
      actionId.current += 1;
      setAction({ id: actionId.current, kind, cells: added });
      setTurnStartedAt(Date.now());

      // If that sank the whole enemy fleet, the game is over - no bot reply.
      if (sunkShipIds(OPPONENT_FLEET, nextShots).size === FLEET.length) {
        return;
      }

      // I struck enemy mine(s): each blast tears into MY board (as bot shots,
      // no charge for anyone) and always ends my turn.
      const struckMines = added.filter(s => s.result === 'mine');
      if (struckMines.length > 0) {
        setBotMines(prev =>
          prev.filter(
            m => !struckMines.some(s => s.row === m.row && s.col === m.col),
          ),
        );
        const blastCells: Shot[] = [];
        for (const cell of struckMines) {
          const blast = dedupe(
            mineBlastCells({ row: cell.row, col: cell.col }, myPlacements),
            [...botShots, ...blastCells],
          );
          blastCells.push(...blast);
        }
        const nextBotShots = [...botShots, ...blastCells];
        setBotShots(nextBotShots);
        botActionId.current += 1;
        setOpponentAction({
          id: botActionId.current,
          kind: 'mine',
          cells: blastCells,
        });
        // The blast may have finished my fleet - loss handled by derived `lost`.
        if (sunkShipIds(myPlacements, nextBotShots).size === FLEET.length) {
          return;
        }
        setTurn('bot');
        scheduleBotTurn();
        return;
      }

      // Hit → keep firing; only a wholly-missed shot passes the turn to the bot.
      if (added.some(s => s.result === 'hit')) {
        return;
      }
      setTurn('bot');
      scheduleBotTurn();
    },
    [
      turn,
      points,
      powerupsUsed,
      botMines,
      myShots,
      botShots,
      myPlacements,
      scheduleBotTurn,
    ],
  );

  const handleTimeout = useCallback(() => {
    if (turn !== 'me') {
      return;
    }
    const next = myTimeouts + 1;
    setMyTimeouts(next);
    if (next >= MAX_TIMEOUTS) {
      return; // loss handled by the derived `lost`
    }
    // Missed the window - hand the turn to the bot.
    setTurn('bot');
    setTurnStartedAt(Date.now());
    scheduleBotTurn();
  }, [turn, myTimeouts, scheduleBotTurn]);

  const sunkByMeIds = useMemo(
    () => sunkShipIds(OPPONENT_FLEET, myShots),
    [myShots],
  );
  const sunkByOpponentIds = useMemo(
    () => sunkShipIds(myPlacements, botShots),
    [myPlacements, botShots],
  );
  const myFleet = useMemo(() => toPlacedShips(myPlacements), [myPlacements]);
  const revealedEnemyShips = useMemo(
    () => toPlacedShips(OPPONENT_FLEET, sunkByMeIds),
    [sunkByMeIds],
  );

  const won = sunkByMeIds.size === FLEET.length;
  const lost =
    sunkByOpponentIds.size === FLEET.length || myTimeouts >= MAX_TIMEOUTS;
  const result: 'win' | 'lose' | null = won ? 'win' : lost ? 'lose' : null;
  const resultReason = result
    ? !won && myTimeouts >= MAX_TIMEOUTS
      ? ('timeout' as const)
      : ('complete' as const)
    : null;

  return {
    phase,
    submitFleet,
    forfeit: () => {},
    // The demo has no waiting phase, so there's no setup clock to race.
    setupDeadline: null,
    playProps: {
      myFleet,
      myMines,
      myShots,
      opponentShots: botShots,
      revealedEnemyShips,
      points,
      powerupsUsed,
      volleys,
      myTurn: turn === 'me' && !result,
      action,
      opponentAction,
      opponent: { initial: 'K', name: 'Kraken' },
      sunkByMe: sunkByMeIds.size,
      sunkByOpponent: sunkByOpponentIds.size,
      turnDeadline: result || turnStartedAt == null ? null : turnStartedAt + TURN_MS,
      myOnline: true,
      opponentOnline: true,
      result,
      resultReason,
      onFire,
      onTimerExpire: handleTimeout,
    },
  };
}
