/**
 * One 'disconnect' listener per socket however many rooms it visits — a
 * listener per room piles up on lobby-hoppers until Node warns of a leak.
 * Re-registering a room replaces its hook, so enter stays idempotent.
 */
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
