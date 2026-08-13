import {
  GameRoomStatus,
  LOBBY_EVENTS,
  type ApiClient,
  type GameRoomSummary,
} from '@gaming-platform/core';
import type { Socket } from 'socket.io-client';

export type TrackedRoom = {
  summary: GameRoomSummary;
  /** First time this runner saw the room; floors the age for rooms that
   *  predate the connection. */
  seenAt: number;
};

/**
 * The shared view of the lobby: socket deltas for freshness, a periodic REST
 * reconcile so a missed event cannot strand the model.
 */
export class LobbyModel {
  private rooms = new Map<string, TrackedRoom>();

  constructor(
    private readonly api: ApiClient,
    /** Our own account ids - a room hosted by one of these is a bot room. */
    private readonly ownUserIds: Set<string>,
  ) {}

  attach(socket: Socket): void {
    socket.on(LOBBY_EVENTS.roomAdded, (payload: GameRoomSummary) =>
      this.upsert(payload),
    );
    socket.on(LOBBY_EVENTS.roomUpdated, (payload: GameRoomSummary) =>
      this.upsert(payload),
    );
    socket.on(LOBBY_EVENTS.roomRemoved, (payload: { roomId: string }) =>
      this.rooms.delete(payload.roomId),
    );
  }

  private upsert(summary: GameRoomSummary): void {
    const existing = this.rooms.get(summary.id);
    this.rooms.set(summary.id, {
      summary,
      seenAt: existing?.seenAt ?? Date.now(),
    });
  }

  async reconcile(): Promise<void> {
    const live = await this.api.listPendingGameRooms();
    const seen = new Set(live.map(room => room.id));
    for (const id of [...this.rooms.keys()]) {
      if (!seen.has(id)) this.rooms.delete(id);
    }
    for (const summary of live) this.upsert(summary);
  }

  isBotRoom(room: GameRoomSummary): boolean {
    return this.ownUserIds.has(room.creatorUserId);
  }

  /** Every open room, ours and theirs - what the lobby floor is measured on. */
  openRooms(): GameRoomSummary[] {
    return [...this.rooms.values()]
      .map(tracked => tracked.summary)
      .filter(
        room => room.status === GameRoomStatus.Pending && !room.isPrivate,
      );
  }

  botHostedRooms(): GameRoomSummary[] {
    return this.openRooms().filter(room => this.isBotRoom(room));
  }

  /** Open rooms hosted by real players, with how long they have been waiting. */
  humanRooms(now = Date.now()): { room: GameRoomSummary; ageMs: number }[] {
    return [...this.rooms.values()]
      .filter(
        tracked =>
          tracked.summary.status === GameRoomStatus.Pending &&
          !tracked.summary.isPrivate &&
          !this.isBotRoom(tracked.summary),
      )
      .map(tracked => ({
        room: tracked.summary,
        ageMs: now - Math.max(Date.parse(tracked.summary.createdAt), tracked.seenAt),
      }));
  }
}
