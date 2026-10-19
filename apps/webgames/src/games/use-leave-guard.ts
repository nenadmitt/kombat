import { useCallback, useEffect, useState } from 'react';

import { useLeaveGuardStore } from '../store/leave-guard.store';

// Leaving a live board forfeits, so every exit waits on the board's confirmation.
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
    pending,
    request,
    resolve,
    cancel: useCallback(() => setPending(null), []),
  };
}
