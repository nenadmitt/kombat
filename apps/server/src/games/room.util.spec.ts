import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameType } from '../db/types/game';
import { getPlayerCountForGameType, isMultiSeatGame } from './game-type.util';
import { participantsOf } from './room.util';

/**
 * Which roster column holds the joiners depends on the game type, decided far
 * from the code that reads it - Salvo shipped reading the wrong one and every
 * match hung on a spinner. participantsOf is the one sanctioned reader.
 */
describe('participantsOf', () => {
  const room = (over: Partial<GameRoomEntity>): GameRoomEntity =>
    ({
      userId: 'creator',
      opponentId: null,
      opponentIds: [],
      ...over,
    }) as unknown as GameRoomEntity;

  it('reads a two-player room from opponentId', () => {
    expect(participantsOf(room({ opponentId: 'joiner' }))).toEqual([
      'creator',
      'joiner',
    ]);
  });

  it('reads a multi-seat room from opponentIds', () => {
    expect(
      participantsOf(room({ opponentIds: ['a', 'b', 'c'] })),
    ).toEqual(['creator', 'a', 'b', 'c']);
  });

  it('a waiting room is just its creator', () => {
    expect(participantsOf(room({}))).toEqual(['creator']);
  });
});

describe('game type capacities', () => {
  // Numeric enum: Object.values carries the reverse mappings too.
  const gameTypes = Object.values(GameType).filter(
    (v): v is GameType => typeof v === 'number',
  );

  it('every playable type has a seat count', () => {
    for (const gameType of gameTypes) {
      expect(getPlayerCountForGameType(gameType)).toBeGreaterThanOrEqual(2);
    }
  });

  it('multi-seat games hold more than a duel', () => {
    for (const gameType of gameTypes) {
      if (isMultiSeatGame(gameType)) {
        expect(getPlayerCountForGameType(gameType)).toBeGreaterThan(2);
      }
    }
  });
});
