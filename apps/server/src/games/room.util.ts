import { GameRoomEntity } from '../db/entities/game-room.entity';

export function participantsOf(room: GameRoomEntity): string[] {
  return [
    room.userId,
    ...(room.opponentId ? [room.opponentId] : []),
    ...room.opponentIds,
  ];
}
