import { useCallback, useEffect, useState } from 'react';

import { useLeaveGuardStore } from '../store/leave-guard.store';

/**
 * Holds every exit from a live board until the player confirms, because
 * leaving forfeits the match. The board renders its own confirmation and
 * resolves it here; `pending` is what that modal hangs off.
 */
export function useLeaveGuard(active: boolean) {
  const arm = useLeaveGuardStore(s => s.arm);
  const disarm = useLeaveGuardStore(s => s.disarm);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const request = useCallback(
    (proceed: () => void) => {
      if (!active) {
        proceed();
        return;
      }
      setPending(() => proceed);
    },
    [active],
  );

  useEffect(() => {
    if (!active) return;
    arm(request);
    return () => {
      disarm();
      setPending(null);
    };
  }, [active, arm, disarm, request]);

  const resolve = useCallback(() => {
    const proceed = pending;
    setPending(null);
    proceed?.();
  }, [pending]);

  return {
    /** Non-null while an exit waits on the confirmation. */
    pending,
    request,
    resolve,
    cancel: useCallback(() => setPending(null), []),
  };
}
