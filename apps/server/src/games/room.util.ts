import { GameRoomEntity } from '../db/entities/game-room.entity';

/** Everyone in the room: creator + joiners (covers both player models —
 *  NavalBattle's single opponentId and Ludo's opponentIds array). */
export function participantsOf(room: GameRoomEntity): string[] {
  return [
    room.userId,
    ...(room.opponentId ? [room.opponentId] : []),
    ...room.opponentIds,
  ];
}
