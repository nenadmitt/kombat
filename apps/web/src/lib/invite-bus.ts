type Listener = (email: string) => void;

const listeners = new Set<Listener>();

/** The hero only collects an email; it hands it to the apply form, which is
 *  where the username is filled in and the request is actually sent. */
export function requestInvite(email: string): void {
  listeners.forEach((listener) => listener(email));
}

export function onInviteRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
