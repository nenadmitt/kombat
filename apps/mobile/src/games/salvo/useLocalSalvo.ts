import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SALVO_MAX_HP,
  SALVO_MOVE_RANGE,
  SALVO_START_ANGLE,
  SALVO_START_POWER,
  SALVO_TANK_START_X,
  SALVO_TURN_SECONDS,
  SalvoSide,
  carveCrater,
  chooseBotAim,
  clampAngle,
  clampPower,
  clampTankX,
  createSalvoTerrain,
  emptySalvoStats,
  fireShot,
  randomSalvoSeed,
  rollWind,
  type SalvoEndReason,
  type SalvoPlayerStats,
  type SalvoShot,
  type SalvoTank,
  type SalvoTerrain,
} from '@gaming-platform/core';

import type {
  SalvoDamageEvent,
  SalvoEngine,
  SalvoFlight,
  SalvoPlayProps,
  SalvoSeatView,
  SalvoTrail,
} from './salvo-engine';

const BOT_NAME = 'Kraken';
const DRIVE_MS = 1500;
const DRIVE_FRAME_MS = 33;
const BOT_AIM_MS = 1100;
const SHELL_FRAME_MS = 16;
const IMPACT_HOLD_MS = 900;
const DESTRUCTION_MS = 3500;

/** The floor is deliberately loose: tightening it much further makes the bot near-unbeatable past round 4. */
const botSpread = (round: number) => Math.max(8, 18 - round * 2);

type Aim = { angle: number; power: number };

type LocalState = {
  terrain: SalvoTerrain;
  hp: Record<SalvoSide, number>;
  x: Record<SalvoSide, number>;
  angle: Record<SalvoSide, number>;
  power: Record<SalvoSide, number>;
  stats: Record<SalvoSide, SalvoPlayerStats>;
  turn: SalvoSide;
  movesLeft: number;
  wind: number;
  shotNumber: number;
  flight: SalvoFlight | null;
  trail: SalvoTrail | null;
  damage: SalvoDamageEvent | null;
  driving: boolean;
  destroyed: SalvoSide | null;
  resultRevealed: boolean;
  botAiming: boolean;
  notice: string | null;
  turnStartedAt: number;
  winner: SalvoSide | null;
  endReason: SalvoEndReason | null;
};

const ME = SalvoSide.Left;
const BOT = SalvoSide.Right;

const roundOf = (shotNumber: number) => Math.ceil(shotNumber / 2);

const freshState = (): LocalState => ({
  terrain: createSalvoTerrain(randomSalvoSeed()),
  hp: { [ME]: SALVO_MAX_HP, [BOT]: SALVO_MAX_HP },
  x: { [ME]: SALVO_TANK_START_X[ME], [BOT]: SALVO_TANK_START_X[BOT] },
  angle: { [ME]: SALVO_START_ANGLE, [BOT]: SALVO_START_ANGLE },
  power: { [ME]: SALVO_START_POWER, [BOT]: SALVO_START_POWER },
  stats: { [ME]: emptySalvoStats(), [BOT]: emptySalvoStats() },
  turn: ME,
  movesLeft: SALVO_MOVE_RANGE,
  wind: rollWind(),
  shotNumber: 1,
  flight: null,
  trail: null,
  damage: null,
  driving: false,
  destroyed: null,
  resultRevealed: false,
  botAiming: false,
  notice: null,
  turnStartedAt: Date.now(),
  winner: null,
  endReason: null,
});

const tankOf = (s: LocalState, side: SalvoSide, aim?: Aim): SalvoTank => ({
  side,
  x: s.x[side],
  hp: s.hp[side],
  angle: aim?.angle ?? s.angle[side],
  power: aim?.power ?? s.power[side],
});

const describeShot = (
  s: LocalState,
  shooter: SalvoSide,
  shot: SalvoShot,
): string => {
  const who = shooter === ME ? 'You' : BOT_NAME;
  if (shot.selfDamage > 0) {
    return `${who} caught the blast - ${shot.selfDamage} self damage`;
  }
  if (shot.kind === 'out-of-bounds') {
    return `${who} sent it off the map`;
  }
  if (shot.damage === 0) {
    const target = shooter === ME ? BOT : ME;
    const flew = Math.abs(shot.impact.x - s.x[shooter]);
    const span = Math.abs(s.x[target] - s.x[shooter]);
    return `${who} fell ${flew < span ? 'short' : 'long'}`;
  }
  if (shot.kind === 'tank') {
    return `Direct hit - ${shot.damage} damage`;
  }
  return `${who} clipped it - ${shot.damage} damage`;
};

export function useLocalSalvo(): SalvoEngine {
  const [state, setState] = useState<LocalState>(freshState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shellTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const driveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shotId = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (shellTimer.current) {
      clearInterval(shellTimer.current);
      shellTimer.current = null;
    }
    if (driveTimer.current) {
      clearInterval(driveTimer.current);
      driveTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const commit = useCallback((shooter: SalvoSide, shot: SalvoShot) => {
    setState(prev => {
      if (prev.winner !== null) {
        return prev;
      }
      const target = shooter === ME ? BOT : ME;
      const terrain: SalvoTerrain = {
        ...prev.terrain,
        heights: [...prev.terrain.heights],
      };
      // A shell that finds a hull detonates on armour, so only ground hits leave a crater.
      if (shot.kind === 'terrain') {
        carveCrater(terrain, shot.impact);
      }

      const round = roundOf(prev.shotNumber);
      const stats: SalvoPlayerStats = { ...prev.stats[shooter] };
      stats.shots += 1;
      if (shot.hit) {
        stats.hits += 1;
        stats.bestHit = Math.max(stats.bestHit, shot.damage);
      }
      const damageByRound = [...stats.damageByRound];
      while (damageByRound.length < round) {
        damageByRound.push(0);
      }
      damageByRound[round - 1] = (damageByRound[round - 1] ?? 0) + shot.damage;
      stats.damageByRound = damageByRound;

      const hp: Record<SalvoSide, number> = { ...prev.hp };
      hp[target] = Math.max(0, hp[target] - shot.damage);
      hp[shooter] = Math.max(0, hp[shooter] - shot.selfDamage);

      const hits = [
        ...(shot.damage > 0
          ? [{ side: target, amount: shot.damage, kind: shot.damageKind }]
          : []),
        ...(shot.selfDamage > 0
          ? [{ side: shooter, amount: shot.selfDamage, kind: 'splash' as const }]
          : []),
      ];

      const winner =
        hp[ME] <= 0 || hp[BOT] <= 0 ? (hp[ME] <= 0 ? BOT : ME) : null;

      return {
        ...prev,
        terrain,
        hp,
        stats: { ...prev.stats, [shooter]: stats },
        flight: null,
        trail: { shooter, path: shot.path, impact: shot.impact, id: shotId.current },
        damage: hits.length
          ? { id: shotId.current, hits }
          : null,
        notice: describeShot(prev, shooter, shot),
        winner,
        destroyed: winner === null ? null : winner === ME ? BOT : ME,
        endReason: winner === null ? null : 'destroyed',
      };
    });
  }, []);

  const nextTurn = useCallback(() => {
    setState(prev => {
      if (prev.winner !== null) {
        return prev;
      }
      const shotNumber = prev.shotNumber + 1;
      const newRound = roundOf(shotNumber) !== roundOf(prev.shotNumber);
      return {
        ...prev,
        turn: prev.turn === ME ? BOT : ME,
        shotNumber,
        movesLeft: SALVO_MOVE_RANGE,
        driving: false,
        botAiming: false,
        wind: newRound ? rollWind() : prev.wind,
        turnStartedAt: Date.now(),
      };
    });
  }, []);

  /** Resolve the shot up front so the animation can never disagree with the outcome. */
  const launch = useCallback(
    (shooter: SalvoSide, aim?: Aim) => {
      const s = stateRef.current;
      if (
        s.winner !== null ||
        s.turn !== shooter ||
        s.flight !== null ||
        s.driving ||
        shellTimer.current
      ) {
        return;
      }
      const target = shooter === ME ? BOT : ME;
      const shot = fireShot(
        s.terrain,
        tankOf(s, shooter, aim),
        tankOf(s, target),
        s.wind,
      );

      shotId.current += 1;
      const id = shotId.current;
      setState(prev => ({
        ...prev,
        notice: null,
        trail: null,
        damage: null,
        botAiming: false,
        flight: {
          shooter,
          path: shot.path,
          shell: shot.path[0] ?? shot.impact,
          id,
        },
      }));

      let i = 0;
      shellTimer.current = setInterval(() => {
        i += 1;
        const next = shot.path[i];
        if (next) {
          setState(prev =>
            prev.flight ? { ...prev, flight: { ...prev.flight, shell: next } } : prev,
          );
          return;
        }
        if (shellTimer.current) {
          clearInterval(shellTimer.current);
          shellTimer.current = null;
        }
        commit(shooter, shot);
        // nextTurn no-ops once a winner exists, so a kill leaves the battlefield up while the wreck burns.
        later(nextTurn, IMPACT_HOLD_MS);
      }, SHELL_FRAME_MS);
    },
    [commit, later, nextTurn],
  );

  const driveTank = useCallback(
    (side: SalvoSide, direction: -1 | 1, units?: number) => {
      const s = stateRef.current;
      if (
        driveTimer.current ||
        s.winner !== null ||
        s.turn !== side ||
        s.flight !== null ||
        s.movesLeft <= 0
      ) {
        return;
      }
      const budget = Math.min(units ?? s.movesLeft, s.movesLeft);
      const frames = Math.max(1, Math.round(DRIVE_MS / DRIVE_FRAME_MS));
      const perFrame = budget / frames;
      let done = 0;

      const stop = () => {
        if (driveTimer.current) {
          clearInterval(driveTimer.current);
          driveTimer.current = null;
        }
        setState(prev => (prev.driving ? { ...prev, driving: false } : prev));
      };

      setState(prev => ({ ...prev, driving: true }));
      driveTimer.current = setInterval(() => {
        done += 1;
        setState(prev => {
          if (prev.winner !== null || prev.turn !== side) {
            return prev;
          }
          const other = side === ME ? BOT : ME;
          const step = Math.min(perFrame, prev.movesLeft);
          const next = clampTankX(prev.x[side], step * direction, side, prev.x[other]);
          const travelled = Math.abs(next - prev.x[side]);
          return {
            ...prev,
            x: { ...prev.x, [side]: next },
            movesLeft: Math.max(0, prev.movesLeft - travelled),
          };
        });
        if (done >= frames || stateRef.current.movesLeft <= 0) {
          stop();
        }
      }, DRIVE_FRAME_MS);
    },
    [],
  );

  useEffect(() => {
    if (state.winner !== null || state.turn !== BOT || state.flight !== null) {
      return;
    }
    const reposition = Math.random() < 0.55;
    const driveMs = reposition ? DRIVE_MS : 0;
    if (reposition) {
      driveTank(
        BOT,
        Math.random() < 0.5 ? -1 : 1,
        SALVO_MOVE_RANGE * (0.4 + Math.random() * 0.6),
      );
    }

    const aimId = setTimeout(() => {
      setState(prev =>
        prev.turn === BOT && prev.winner === null
          ? { ...prev, botAiming: true }
          : prev,
      );
    }, driveMs);
    timers.current.push(aimId);

    const fireId = setTimeout(() => {
      const s = stateRef.current;
      if (s.winner !== null || s.turn !== BOT || s.flight !== null) {
        return;
      }
      const aim = chooseBotAim(
        s.terrain,
        tankOf(s, BOT),
        tankOf(s, ME),
        s.wind,
        botSpread(roundOf(s.shotNumber)),
      );
      setState(prev => ({
        ...prev,
        angle: { ...prev.angle, [BOT]: aim.angle },
        power: { ...prev.power, [BOT]: aim.power },
      }));
      launch(BOT, aim);
    }, driveMs + BOT_AIM_MS);
    timers.current.push(fireId);

    return () => {
      clearTimeout(aimId);
      clearTimeout(fireId);
    };
  }, [state.winner, state.turn, state.flight, launch, driveTank]);

  useEffect(() => {
    if (state.winner === null || state.resultRevealed) {
      return;
    }
    const id = setTimeout(
      () =>
        setState(prev =>
          prev.winner === null ? prev : { ...prev, resultRevealed: true },
        ),
      DESTRUCTION_MS,
    );
    timers.current.push(id);
    return () => clearTimeout(id);
  }, [state.winner, state.resultRevealed]);

  const onAim = useCallback((aim: { angle?: number; power?: number }) => {
    setState(prev => {
      if (prev.winner !== null || prev.turn !== ME || prev.flight !== null) {
        return prev;
      }
      return {
        ...prev,
        angle:
          aim.angle === undefined
            ? prev.angle
            : { ...prev.angle, [ME]: clampAngle(aim.angle) },
        power:
          aim.power === undefined
            ? prev.power
            : { ...prev.power, [ME]: clampPower(aim.power) },
      };
    });
  }, []);

  const onMove = useCallback(
    (direction: -1 | 1) => driveTank(ME, direction),
    [driveTank],
  );

  const onFire = useCallback(() => {
    const s = stateRef.current;
    if (s.winner === null && s.turn === ME && s.flight === null) {
      launch(ME);
    }
  }, [launch]);

  const forfeit = useCallback(() => {
    clearTimers();
    setState(prev =>
      prev.winner !== null
        ? prev
        : {
            ...prev,
            winner: BOT,
            endReason: 'forfeit',
            resultRevealed: true,
            flight: null,
          },
    );
  }, [clearTimers]);

  const seats: SalvoSeatView[] = [
    {
      side: ME,
      name: 'You',
      initial: 'Y',
      isMe: true,
      hp: state.hp[ME],
      x: state.x[ME],
      angle: state.angle[ME],
      power: state.power[ME],
    },
    {
      side: BOT,
      name: BOT_NAME,
      initial: BOT_NAME.charAt(0),
      isMe: false,
      hp: state.hp[BOT],
      x: state.x[BOT],
      angle: state.angle[BOT],
      power: state.power[BOT],
    },
  ];

  // Gate on `winner`, not `result`: the result waits for the wreck to burn, or the player could keep firing at a corpse.
  const over = state.winner !== null;
  const result: 'win' | 'lose' | null = !state.resultRevealed
    ? null
    : state.winner === ME
      ? 'win'
      : 'lose';
  const myTurn = !over && state.turn === ME && state.flight === null;
  const armed = myTurn && !state.driving;

  const playProps: SalvoPlayProps = {
    terrain: state.terrain,
    seats,
    me: ME,
    myTurn,
    armed,
    movesLeft: state.turn === ME ? state.movesLeft : 0,
    wind: state.wind,
    shotNumber: state.shotNumber,
    round: roundOf(state.shotNumber),
    flight: state.flight,
    trail: state.trail,
    damage: state.damage,
    aiming: armed ? ME : state.botAiming && !over ? BOT : null,
    destroyed: state.destroyed,
    notice: state.notice,
    turnDeadline: over ? null : state.turnStartedAt + SALVO_TURN_SECONDS * 1000,
    result,
    resultReason: result ? state.endReason : null,
    stats: state.stats,
    onAim,
    onMove,
    onFire,
    onTimerExpire: onFire,
  };

  return { phase: 'play', forfeit, playProps };
}
