import { X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

const SMALL = '(max-width: 860px)';

export function SmallScreenNotice() {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL).matches);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(SMALL);
    const onChange = (e: MediaQueryListEvent) => setSmall(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!small || dismissed) return null;

  return (
    <div className="small-screen-notice" role="status">
      <div>
        <strong>Kombat is built for a bigger screen.</strong>
        The mobile web layout is not properly supported yet - play on a desktop
        browser, or grab the Kombat mobile app. A proper mobile version is
        coming soon.
      </div>
      <button
        type="button"
        className="icon-btn small-screen-notice-x"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
