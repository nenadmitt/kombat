/** Which game a room is for. Stored server-side as smallint, not a Postgres enum. */
export enum GameType {
  NavalBattle = 0,
}

/**
 * A room's lifecycle: Pending (waiting for players, can still be closed) ->
 * InProgress (started, can no longer be closed) -> Completed.
 */
export enum GameRoomStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
}

export type GameRoomSummary = {
  id: string;
  gameType: GameType;
  status: GameRoomStatus;
  /** How many players this game type requires (e.g. NavalBattle = 2). */
  playerCount: number;
  createdAt: string;
};
