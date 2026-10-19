import { formatCountdown } from '@gaming-platform/core';
import { useEffect, useState } from 'react';

type Props = {
  deadline: number;
  label?: string;
  onExpire?: () => void;
};

export function Countdown({ deadline, label, onExpire }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = seconds === 0;

  useEffect(() => {
    if (expired) onExpire?.();
    // Once per deadline: onExpire itself guards re-entry.
  }, [expired, deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bs-clock">
      <span
        className="mono bs-clock-value"
        style={{ color: seconds <= 5 ? 'var(--loss)' : 'var(--text)' }}
      >
        {formatCountdown(seconds)}
      </span>
      {label && <span className="stat-label">{label}</span>}
    </div>
  );
}
