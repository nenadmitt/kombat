import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCountdown } from '@gaming-platform/core';

type Props = {
  /** Epoch ms the current turn ends, or null when there's no active turn. */
  deadline: number | null;
  /** Fired once when the countdown reaches 0 (demo enforces; multiplayer no-ops). */
  onExpire?: () => void;
  style?: StyleProp<TextStyle>;
};

const secondsUntil = (deadline: number | null): number =>
  deadline == null ? 0 : Math.max(0, Math.round((deadline - Date.now()) / 1000));

/**
 * A countdown to a wall-clock deadline. Owning its own tick means it re-renders
 * only this text, never the parent screen (and its heavy Skia board). Restarts
 * whenever the deadline changes (a new turn); fires `onExpire` once per turn.
 */
export default function TurnTimer({ deadline, onExpire, style }: Props) {
  const [left, setLeft] = useState(() => secondsUntil(deadline));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setLeft(secondsUntil(deadline));
    if (deadline == null) {
      return;
    }
    let fired = false;
    const id = setInterval(() => {
      const s = secondsUntil(deadline);
      setLeft(s);
      if (s <= 0 && !fired) {
        fired = true;
        clearInterval(id);
        onExpireRef.current?.();
      }
    }, 500);
    return () => clearInterval(id);
  }, [deadline]);

  return <Text style={style}>{formatCountdown(left)}</Text>;
}
