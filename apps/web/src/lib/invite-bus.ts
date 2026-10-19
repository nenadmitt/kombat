type Listener = (email: string) => void;

const listeners = new Set<Listener>();

export function requestInvite(email: string): void {
  listeners.forEach((listener) => listener(email));
}

export function onInviteRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
