import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { ISecurityContext } from '../authentication/authentication.types';
import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameType } from '../db/types/game';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import { RpsMatchService } from './rps/rps-match.service';
import { SalvoMatchService } from './salvo/salvo-match.service';
import { StakesService } from './stakes/stakes.service';

const USER = '11111111-1111-4111-8111-111111111111';
const ROOM = '33333333-3333-4333-8333-333333333333';
const ctx = { userId: USER } as ISecurityContext;

type MatchMock = { getOrCreate: jest.Mock; stateFor: jest.Mock };

/**
 * GET /games/rooms/:id/state falls through to Battleship, so a game type
 * missing its dispatch branch silently gets a Battleship match created
 * against its room id (this shipped once). This spec pins the branch for
 * every playable type - adding game six without a branch fails here.
 */
describe('GamesController.getRoomState dispatch', () => {
  let controller: GamesController;
  let services: Record<string, MatchMock>;
  let dbRoom: GameRoomEntity | null;

  const mock = (name: string): MatchMock => ({
    getOrCreate: jest.fn().mockResolvedValue(undefined),
    stateFor: jest.fn().mockResolvedValue({ from: name }),
  });

  beforeEach(() => {
    dbRoom = null;
    services = {
      battleship: mock('battleship'),
      chroma: mock('chroma'),
      ludo: mock('ludo'),
      rps: mock('rps'),
      salvo: mock('salvo'),
    };
    const db = {
      // Only the fresh variant exists on the mock: the cached read stranding
      // players on a spinner is the regression this guards.
      findGameRoomByIdFresh: async () => dbRoom,
    } as unknown as DbService;

    controller = new GamesController(
      {} as GamesService,
      db,
      services.battleship as unknown as BattleshipMatchService,
      services.chroma as unknown as ChromaMatchService,
      services.ludo as unknown as LudoMatchService,
      services.rps as unknown as RpsMatchService,
      services.salvo as unknown as SalvoMatchService,
      {} as StakesService,
    );
  });

  const room = (gameType: GameType): GameRoomEntity =>
    ({
      id: ROOM,
      userId: USER,
      opponentId: null,
      opponentIds: [],
      gameType,
    }) as unknown as GameRoomEntity;

  const DISPATCH: [GameType, string][] = [
    [GameType.NavalBattle, 'battleship'],
    [GameType.Ludo, 'ludo'],
    [GameType.TripleCut, 'rps'],
    [GameType.ChromaClash, 'chroma'],
    [GameType.Salvo, 'salvo'],
  ];

  it.each(DISPATCH)('%s state comes from its own match service', async (gameType, owner) => {
    dbRoom = room(gameType);
    const state = await controller.getRoomState(ROOM, ctx);

    expect(state).toEqual({ from: owner });
    expect(services[owner].getOrCreate).toHaveBeenCalled();
    for (const [name, svc] of Object.entries(services)) {
      if (name !== owner) {
        expect(svc.getOrCreate).not.toHaveBeenCalled();
      }
    }
  });

  it('refuses a non-participant before any match is created', async () => {
    dbRoom = {
      ...room(GameType.NavalBattle),
      userId: '99999999-9999-4999-8999-999999999999',
    } as GameRoomEntity;

    await expect(controller.getRoomState(ROOM, ctx)).rejects.toThrow(
      ForbiddenException,
    );
    for (const svc of Object.values(services)) {
      expect(svc.getOrCreate).not.toHaveBeenCalled();
    }
  });

  it('404s an unknown room', async () => {
    await expect(controller.getRoomState(ROOM, ctx)).rejects.toThrow(
      NotFoundException,
    );
  });
});
