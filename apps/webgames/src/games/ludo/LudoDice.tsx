import { useEffect, useState } from 'react';

/** Which of the 3x3 pip positions light up per die value. */
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
  /** 1-6, or null before the first roll (renders a blank face). */
  value: number | null;
  /** While true the face shuffles and the die wobbles in place. */
  rolling?: boolean;
};

export function LudoDice({ value, rolling = false }: Props) {
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

  const lit = face ? (PIPS[face] ?? []) : [];

  return (
    <div className={rolling ? 'ludo-die is-rolling' : 'ludo-die'}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={lit.includes(i) ? 'ludo-pip is-lit' : 'ludo-pip'} />
      ))}
    </div>
  );
}
