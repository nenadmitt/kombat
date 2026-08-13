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
  /** First time this runner saw the room; floors the age for rooms that
   *  predate the connection. */
  seenAt: number;
};

const BOT_USERNAMES = new Set(
  BOT_ACCOUNTS.map(account => account.username.toLowerCase()),
);

/**
 * The shared view of the lobby: socket deltas for freshness, a periodic REST
 * reconcile so a missed event cannot strand the model.
 */
export class LobbyModel {
  private rooms = new Map<string, TrackedRoom>();
  /** creatorUserId -> is that account on the bot roster. */
  private creatorIsBot = new Map<string, boolean>();

  constructor(
    private readonly api: ApiClient,
    /** The accounts this process runs; always bots, no lookup needed. */
    private readonly ownUserIds: Set<string>,
  ) {}

  /**
   * Own-account ids only cover the bots *this* process runs. Another runner,
   * a smaller BOTS_COUNT, or a leftover room from an earlier roster would all
   * look like a real player, and bots would end up playing each other. The
   * roster in core is the shared answer, so unknown hosts get resolved by
   * username before any of them can be joined.
   */
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
    // A host the profile lookup did not return stays unknown, and unknown
    // hosts are never joined.
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
