import { GameType } from '@gaming-platform/core';
import { useCallback, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { MatchOverlay } from '../components/MatchOverlay';
import { BattleshipDemoPage, BattleshipMatchPage } from './BattleshipMatchPage';
import { DemoRpsPage } from './DemoRpsPage';
import { LudoDemoPage, LudoMatchPage } from './LudoMatchPage';
import { SalvoDemoPage, SalvoMatchPage } from './SalvoMatchPage';
import { RpsMatchPage } from './RpsMatchPage';
import { isWebPlayable } from '../lib/format';
import { useLeaveGuardStore } from '../store/leave-guard.store';

/**
 * The game type rides in the URL because there is no endpoint that resolves a
 * room id to its game: `/games/rooms/:id/state` already needs to know which
 * shape to parse.
 */
function parseGameType(raw: string | undefined): GameType | null {
  const value = Number(raw);
  return Number.isInteger(value) && isWebPlayable(value as GameType)
    ? (value as GameType)
    : null;
}

export function MatchPage() {
  const { gameType, roomId } = useParams();
  const parsed = parseGameType(gameType);

  if (parsed === null || !roomId) return <Navigate to="/lobby" replace />;

  return (
    <Board exit="/lobby">
      {parsed === GameType.TripleCut && <RpsMatchPage roomId={roomId} />}
      {parsed === GameType.NavalBattle && <BattleshipMatchPage roomId={roomId} />}
      {parsed === GameType.Salvo && <SalvoMatchPage roomId={roomId} />}
      {parsed === GameType.Ludo && <LudoMatchPage roomId={roomId} />}
    </Board>
  );
}

export function DemoPage() {
  const parsed = parseGameType(useParams().gameType);

  if (parsed === null) return <Navigate to="/games" replace />;

  return (
    <Board exit="/games">
      {parsed === GameType.TripleCut && <DemoRpsPage />}
      {parsed === GameType.NavalBattle && <BattleshipDemoPage />}
      {parsed === GameType.Salvo && <SalvoDemoPage />}
      {parsed === GameType.Ludo && <LudoDemoPage />}
    </Board>
  );
}

/**
 * Every board runs in the overlay. Reaching outside it is an exit like any
 * other, so it goes through whatever guard the live match armed.
 */
function Board({ exit, children }: { exit: string; children: ReactNode }) {
  const intercept = useLeaveGuardStore(s => s.intercept);
  const navigate = useNavigate();

  const dismiss = useCallback(() => {
    const leave = () => navigate(exit);
    if (intercept) intercept(leave);
    else leave();
  }, [intercept, navigate, exit]);

  return <MatchOverlay onDismiss={dismiss}>{children}</MatchOverlay>;
}
