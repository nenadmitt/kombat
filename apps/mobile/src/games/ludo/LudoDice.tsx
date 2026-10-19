import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const SHUFFLE_MS = 90;

type Props = {
  value: number | null;
  rolling?: boolean;
  size?: number;
};

/** Pip sizes are computed in px: percent+wrap collapses on some RN versions. */
export default function LudoDice({ value, rolling = false, size = 78 }: Props) {
  const [face, setFace] = useState(value);

  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const id = setInterval(
      () => setFace(1 + Math.floor(Math.random() * 6)),
      SHUFFLE_MS,
    );
    return () => clearInterval(id);
  }, [rolling, value]);

  const tilt = useSharedValue(0);
  useEffect(() => {
    if (rolling) {
      tilt.value = withRepeat(
        withSequence(
          withTiming(-0.14, { duration: SHUFFLE_MS }),
          withTiming(0.14, { duration: SHUFFLE_MS }),
        ),
        -1,
        true,
      );
    } else {
      tilt.value = withTiming(0, { duration: 140 });
    }
  }, [rolling, tilt]);
  const wobble = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}rad` }],
  }));

  const pad = size * 0.19;
  const gap = size * 0.065;
  const pip = (size - pad * 2 - gap * 2) / 3;
  const lit = face ? (PIPS[face] ?? []) : [];

  return (
    <Animated.View
      style={[
        styles.die,
        { width: size, height: size, borderRadius: size * 0.26 },
        wobble,
      ]}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: pad + col * (pip + gap),
              top: pad + row * (pip + gap),
              width: pip,
              height: pip,
              borderRadius: pip / 2,
              backgroundColor: lit.includes(i) ? '#20222e' : 'transparent',
            }}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  die: {
    backgroundColor: '#f4f5fa',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
