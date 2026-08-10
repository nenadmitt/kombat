import { GameRoomStatus } from '@gaming-platform/core';
import { useEffect } from 'react';

import { useActiveRoomStore } from '../store/active-room.store';

/** Arms the browser's leave-tab prompt while a room or match would be lost. */
export function UnloadGuard() {
  const room = useActiveRoomStore(s => s.room);

  useEffect(() => {
    if (!room) return;
    // Browsers show their own generic dialog; the text is a best effort.
    const message =
      room.status === GameRoomStatus.InProgress
        ? 'You are in a live match. Leaving forfeits it.'
        : 'Your room is still open. Closing this tab will shut it down.';
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [room]);

  return null;
}
