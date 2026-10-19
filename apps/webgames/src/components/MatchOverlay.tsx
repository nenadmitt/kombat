import { useEffect, type ReactNode } from 'react';

import { ConnectionBanner } from './ConnectionBanner';

type Props = {
  onDismiss: () => void;
  children: ReactNode;
};

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
      // Down on the scrim, not click: a drag that starts on the board must not count as outside it.
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
