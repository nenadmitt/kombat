/** Room-naming helpers so per-user and per-channel rooms can't collide. */
export const userRoom = (userId: string): string => `user:${userId}`;
export const channelRoom = (channel: string): string => `channel:${channel}`;

/** Channel name a game room's two players join for message broadcasts. */
export const gameChannel = (roomId: string): string => `game:${roomId}`;

const GAME_CHANNEL_PREFIX = 'game:';

/**
 * Inverse of `gameChannel`: the room id a channel names, or null when it isn't
 * a game channel at all (the lobby is open to every signed-in client).
 *
 * Subscribing is authorized off this - a game channel carries one match's live
 * broadcasts, so only that match's players may join it.
 */
export const gameChannelRoomId = (channel: string): string | null =>
  channel.startsWith(GAME_CHANNEL_PREFIX)
    ? channel.slice(GAME_CHANNEL_PREFIX.length)
    : null;
