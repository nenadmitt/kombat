import { StyleSheet, View } from 'react-native';

/** Which of the 3x3 pip positions light up per die value (design's die). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

type Props = {
  /** 1-6, or null before the first roll (renders an empty face). */
  value: number | null;
  size?: number;
};

/** The white die face from the design: rounded ivory square, dark pips. */
export default function LudoDice({ value, size = 78 }: Props) {
  const lit = value ? PIPS[value] ?? [] : [];
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.26 }]}>
      <View style={styles.grid}>
        {Array.from({ length: 9 }, (_, i) => (
          <View
            key={i}
            style={[
              styles.pip,
              { backgroundColor: lit.includes(i) ? '#2a2140' : 'transparent' },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  die: {
    backgroundColor: '#f4f5fa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  grid: {
    width: '100%',
    aspectRatio: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  pip: {
    // 3 per row inside the padded square (gap-aware thirds).
    width: '28%',
    aspectRatio: 1,
    borderRadius: 999,
    flexGrow: 1,
  },
});
