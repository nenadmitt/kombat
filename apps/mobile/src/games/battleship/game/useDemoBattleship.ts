import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bombCells,
  FLEET,
  type FireKind,
  type FleetPlacements,
  GRID,
  MAX_TIMEOUTS,
  POINTS_PER_HIT,
  POWERUP_COST,
  resolveShot,
  type Shot,
  sunkShipIds,
  TURN_SECONDS,
  torpedoCells,
} from '@gaming-platform/core';

import type { GridAction } from '../BattleshipGrid';
import { OPPONENT_FLEET } from './opponent-fleet';
import type { BattleshipEngine } from './battleship-engine';
import { toPlacedShips } from './battleship-view';

const BOT_MIN_DELAY = 3000;
const BOT_MAX_DELAY = 4000;
const TURN_MS = TURN_SECONDS * 1000;

/**
 * Single-player demo engine: resolves the player's shots locally against a
 * fixed enemy fleet, and after each shot the bot fires back at a random cell of
 * the player's board after a 3–4s delay. The player has 30s per move; three
 * turn timeouts and they lose. No networking (both sides always "online").
 */
export function useDemoBattleship(): BattleshipEngine {
  const [phase, setPhase] = useState<'setup' | 'play'>('setup');
  const [myPlacements, setMyPlacements] = useState<FleetPlacements>({});
  const [myShots, setMyShots] = useState<Shot[]>([]);
  const [botShots, setBotShots] = useState<Shot[]>([]);
  const [points, setPoints] = useState(0);
  const [turn, setTurn] = useState<'me' | 'bot'>('me');
  const [action, setAction] = useState<GridAction | null>(null);
  const [myTimeouts, setMyTimeouts] = useState(0);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const actionId = useRef(0);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs so the delayed bot callback reads current values.
  const myPlacementsRef = useRef(myPlacements);
  myPlacementsRef.current = myPlacements;
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
      const already = new Set(botShotsRef.current.map(s => `${s.row},${s.col}`));
      const open: { row: number; col: number }[] = [];
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (!already.has(`${r},${c}`)) {
            open.push({ row: r, col: c });
          }
        }
      }
      if (open.length === 0) {
        setTurn('me');
        setTurnStartedAt(Date.now());
        return;
      }
      const pick = open[Math.floor(Math.random() * open.length)]!;
      const result = resolveShot(pick.row, pick.col, fleet);
      const nextBotShots = [...botShotsRef.current, { ...pick, result }];
      setBotShots(nextBotShots);
      // Bot sank the whole fleet → game over (no more turns).
      if (sunkShipIds(fleet, nextBotShots).size === FLEET.length) {
        return;
      }
      // Hit → bot fires again; miss → turn returns to the player.
      if (result === 'hit') {
        scheduleBotTurn();
      } else {
        setTurn('me');
        setTurnStartedAt(Date.now());
      }
    }, delay);
  }, []);

  const submitFleet = useCallback((placements: FleetPlacements) => {
    setMyPlacements(placements);
    setTurn('me');
    setTurnStartedAt(Date.now());
    setPhase('play');
  }, []);

  const onFire = useCallback(
    (kind: FireKind, row: number, col: number) => {
      if (turn !== 'me') {
        return;
      }
      if (kind !== 'single' && points < POWERUP_COST) {
        return;
      }
      const resolved =
        kind === 'single'
          ? [{ row, col, result: resolveShot(row, col, OPPONENT_FLEET) }]
          : kind === 'torpedo'
            ? torpedoCells(row, OPPONENT_FLEET)
            : bombCells(row, col, OPPONENT_FLEET);
      const already = new Set(myShots.map(s => `${s.row},${s.col}`));
      const added = resolved.filter(s => !already.has(`${s.row},${s.col}`));
      if (added.length === 0) {
        return;
      }

      if (kind !== 'single') {
        setPoints(p => p - POWERUP_COST);
      }
      setPoints(p => p + added.filter(s => s.result === 'hit').length * POINTS_PER_HIT);

      const nextShots = [...myShots, ...added];
      setMyShots(nextShots);
      actionId.current += 1;
      setAction({ id: actionId.current, kind, cells: added });
      setTurnStartedAt(Date.now());

      // If that sank the whole enemy fleet, the game is over — no bot reply.
      if (sunkShipIds(OPPONENT_FLEET, nextShots).size === FLEET.length) {
        return;
      }
      // Hit → keep firing; only a wholly-missed shot passes the turn to the bot.
      if (added.some(s => s.result === 'hit')) {
        return;
      }
      setTurn('bot');
      scheduleBotTurn();
    },
    [turn, points, myShots, scheduleBotTurn],
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
    // Missed the window — hand the turn to the bot.
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

  return {
    phase,
    submitFleet,
    forfeit: () => {},
    playProps: {
      myFleet,
      myShots,
      opponentShots: botShots,
      revealedEnemyShips,
      points,
      myTurn: turn === 'me' && !result,
      action,
      opponent: { initial: 'K', name: 'Kraken' },
      sunkByMe: sunkByMeIds.size,
      sunkByOpponent: sunkByOpponentIds.size,
      turnDeadline: result || turnStartedAt == null ? null : turnStartedAt + TURN_MS,
      myOnline: true,
      opponentOnline: true,
      result,
      onFire,
      onTimerExpire: handleTimeout,
    },
  };
}
