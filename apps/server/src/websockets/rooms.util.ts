// Prefixed so per-user and per-channel rooms can't collide.
export const userRoom = (userId: string): string => `user:${userId}`;
export const channelRoom = (channel: string): string => `channel:${channel}`;

export const gameChannel = (roomId: string): string => `game:${roomId}`;

const GAME_CHANNEL_PREFIX = 'game:';

export const gameChannelRoomId = (channel: string): string | null =>
  channel.startsWith(GAME_CHANNEL_PREFIX)
    ? channel.slice(GAME_CHANNEL_PREFIX.length)
    : null;
