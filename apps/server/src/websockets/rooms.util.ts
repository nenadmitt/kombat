/** Room-naming helpers so per-user and per-channel rooms can't collide. */
export const userRoom = (userId: string): string => `user:${userId}`;
export const channelRoom = (channel: string): string => `channel:${channel}`;
