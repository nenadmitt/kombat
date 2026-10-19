import {
  BOT_ACCOUNTS,
  GameRoomStatus,
  LOBBY_EVENTS,
  type ApiClient,
  type GameRoomSummary,
} from '@gaming-platform/core';
import type { Socket } from 'socket.io-client';

export type TrackedRoom = {
  summary: GameRoomSummary;
  seenAt: number;
};

const BOT_USERNAMES = new Set(
  BOT_ACCOUNTS.map(account => account.username.toLowerCase()),
);

export class LobbyModel {
  private rooms = new Map<string, TrackedRoom>();
  private creatorIsBot = new Map<string, boolean>();

  constructor(
    private readonly api: ApiClient,
    private readonly ownUserIds: Set<string>,
  ) {}

  // Other runners or older rosters host rooms too, so unknown hosts are resolved by username before any join.
  async classifyHosts(): Promise<void> {
    const unknown = [
      ...new Set(
        [...this.rooms.values()]
          .map(tracked => tracked.summary.creatorUserId)
          .filter(id => !this.ownUserIds.has(id) && !this.creatorIsBot.has(id)),
      ),
    ];
    if (unknown.length === 0) return;

    const profiles = await this.api.getUserProfiles(unknown);
    for (const profile of profiles) {
      this.creatorIsBot.set(
        profile.id,
        BOT_USERNAMES.has((profile.username ?? '').toLowerCase()),
      );
    }
    // Unresolved hosts are treated as bots so they are never joined.
    for (const id of unknown) {
      if (!this.creatorIsBot.has(id)) this.creatorIsBot.set(id, true);
    }
  }

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
    if (this.ownUserIds.has(room.creatorUserId)) return true;
    return this.creatorIsBot.get(room.creatorUserId) ?? true;
  }

  openRooms(): GameRoomSummary[] {
    return [...this.rooms.values()]
      .map(tracked => tracked.summary)
      .filter(
        room => room.status === GameRoomStatus.Pending && !room.isPrivate,
      );
  }

  openRoomsByGame(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const room of this.openRooms()) {
      counts.set(room.gameType, (counts.get(room.gameType) ?? 0) + 1);
    }
    return counts;
  }

  botHostedRooms(): GameRoomSummary[] {
    return this.openRooms().filter(room => this.isBotRoom(room));
  }

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
