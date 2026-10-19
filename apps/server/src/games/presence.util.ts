// One 'disconnect' listener per socket, not per room, or lobby-hoppers pile up listeners.
export function registerPresenceHook(
  client: {
    data: object;
    once(event: 'disconnect', listener: () => void): unknown;
  },
  roomId: string,
  hook: () => void,
): void {
  const data = client.data as { presenceHooks?: Map<string, () => void> };
  if (!data.presenceHooks) {
    const hooks = new Map<string, () => void>();
    data.presenceHooks = hooks;
    client.once('disconnect', () => {
      for (const run of hooks.values()) {
        run();
      }
    });
  }
  data.presenceHooks.set(roomId, hook);
}
