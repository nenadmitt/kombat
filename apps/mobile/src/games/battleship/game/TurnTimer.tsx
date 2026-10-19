import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCountdown } from '@gaming-platform/core';

type Props = {
  deadline: number | null;
  onExpire?: () => void;
  style?: StyleProp<TextStyle>;
};

const secondsUntil = (deadline: number | null): number =>
  deadline == null ? 0 : Math.max(0, Math.round((deadline - Date.now()) / 1000));

/** Owns its own tick so only this text re-renders, never the parent's heavy Skia board. */
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
