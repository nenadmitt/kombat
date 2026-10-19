import { ArrowClockwise, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { useWebsocketStore } from '../store/websocket.store';

/** socket.io retries on its own, so a blip should not flash a banner. */
const GRACE_MS = 1200;

export function ConnectionBanner() {
  const status = useWebsocketStore(s => s.status);
  const kicked = useWebsocketStore(s => s.kicked);
  const reconnect = useWebsocketStore(s => s.reconnect);
  const [shown, setShown] = useState(false);

  const offline = status !== 'connected';

  useEffect(() => {
    if (!offline) {
      setShown(false);
      return;
    }
    if (kicked) {
      setShown(true);
      return;
    }
    const timer = setTimeout(() => setShown(true), GRACE_MS);
    return () => clearTimeout(timer);
  }, [offline, kicked]);

  if (!offline || !shown) return null;

  return (
    <div className={kicked ? 'conn-banner is-kicked' : 'conn-banner'} role="status">
      <span className="conn-banner-tile">
        <WifiSlash size={18} weight="bold" />
      </span>

      <div className="conn-banner-copy">
        <span className="conn-banner-title">
          {kicked ? 'Playing in another tab' : 'Connection lost'}
        </span>
        <span className="conn-banner-text">
          {kicked
            ? 'This tab was disconnected when Kombat opened somewhere else. Online games are paused here.'
            : 'Reconnecting to the game server. Online games are paused until it is back.'}
        </span>
      </div>

      <button type="button" className="btn btn-surface" onClick={reconnect}>
        <ArrowClockwise size={14} weight="bold" />
        {kicked ? 'Play here' : 'Retry'}
      </button>
    </div>
  );
}
