import { useEffect, type ReactNode } from 'react';

import { ConnectionBanner } from './ConnectionBanner';

type Props = {
  /** Escape and a click on the scrim both come through here. */
  onDismiss: () => void;
  children: ReactNode;
};

/** Lifts a board out of the shell and onto the whole viewport. */
export function MatchOverlay({ onDismiss, children }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="match-overlay"
      // Down on the scrim itself, not click: a drag that starts on the board
      // (placing a ship) must never count as reaching outside it.
      onMouseDown={event => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="match-surface">
        <ConnectionBanner />
        {children}
      </div>
    </div>
  );
}
