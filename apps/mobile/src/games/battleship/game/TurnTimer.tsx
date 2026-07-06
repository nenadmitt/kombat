import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { formatCountdown } from '../setup/ship-placement.utils';

type Props = {
  /** Seconds to count down from (and to restart at on each reset). */
  seconds: number;
  /** Bump this to restart the countdown (e.g. after each shot). */
  resetSignal?: number;
  /** Fired once when the countdown reaches 0:00. */
  onExpire?: () => void;
  style?: StyleProp<TextStyle>;
};

/**
 * A self-contained countdown that owns its own per-second state, so ticking
 * only re-renders this text — never the parent screen (and its heavy Skia
 * board). One interval is created per mount/reset (not per tick) and it stops
 * at 0:00.
 */
export default function TurnTimer({ seconds, resetSignal, onExpire, style }: Props) {
  const [left, setLeft] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setLeft(seconds);
    const id = setInterval(() => {
      setLeft(s => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [seconds, resetSignal]);

  useEffect(() => {
    if (left === 0) {
      onExpireRef.current?.();
    }
  }, [left]);

  return <Text style={style}>{formatCountdown(left)}</Text>;
}
