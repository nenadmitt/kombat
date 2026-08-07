import { GameType } from '@gaming-platform/core';
import { Navigate, useParams } from 'react-router-dom';

import { BattleshipDemoPage, BattleshipMatchPage } from './BattleshipMatchPage';
import { DemoRpsPage } from './DemoRpsPage';
import { LudoDemoPage, LudoMatchPage } from './LudoMatchPage';
import { SalvoDemoPage, SalvoMatchPage } from './SalvoMatchPage';
import { RpsMatchPage } from './RpsMatchPage';
import { isWebPlayable } from '../lib/format';

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
  if (parsed === GameType.TripleCut) return <RpsMatchPage roomId={roomId} />;
  if (parsed === GameType.NavalBattle) return <BattleshipMatchPage roomId={roomId} />;
  if (parsed === GameType.Salvo) return <SalvoMatchPage roomId={roomId} />;
  if (parsed === GameType.Ludo) return <LudoMatchPage roomId={roomId} />;
  return <Navigate to="/lobby" replace />;
}

export function DemoPage() {
  const parsed = parseGameType(useParams().gameType);

  if (parsed === GameType.TripleCut) return <DemoRpsPage />;
  if (parsed === GameType.NavalBattle) return <BattleshipDemoPage />;
  if (parsed === GameType.Salvo) return <SalvoDemoPage />;
  if (parsed === GameType.Ludo) return <LudoDemoPage />;
  return <Navigate to="/games" replace />;
}
