import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { formatCountdown } from '../setup/ship-placement.utils';

type Props = {
  /** Seconds to count down from (and to restart at on each reset). */
  seconds: number;
  /** Bump this to restart the countdown (e.g. after each shot). */
  resetSignal?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * A self-contained countdown that owns its own per-second state, so ticking
 * only re-renders this text — never the parent screen (and its heavy Skia
 * board). One interval is created per mount/reset (not per tick) and it stops
 * at 0:00.
 */
export default function TurnTimer({ seconds, resetSignal, style }: Props) {
  const [left, setLeft] = useState(seconds);

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

  return <Text style={style}>{formatCountdown(left)}</Text>;
}
