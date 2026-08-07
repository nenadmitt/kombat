import type { LudoColor } from '@gaming-platform/core';

/** Seat colour as a CSS token reference, for anything the browser paints. */
export const LUDO_COLOR_VAR: Record<LudoColor, string> = {
  red: 'var(--ludo-red)',
  green: 'var(--ludo-green)',
  yellow: 'var(--ludo-yellow)',
  blue: 'var(--ludo-blue)',
};

/** SVG fills need a concrete colour, so the channel triples live here once. */
const RGB: Record<LudoColor, [number, number, number]> = {
  red: [255, 90, 110],
  green: [62, 224, 143],
  yellow: [245, 184, 41],
  blue: [91, 141, 239],
};

export const LUDO_COLOR_HEX: Record<LudoColor, string> = {
  red: '#ff5a6e',
  green: '#3ee08f',
  yellow: '#f5b829',
  blue: '#5b8def',
};

export function ludoTint(color: LudoColor, alpha: number): string {
  const [r, g, b] = RGB[color];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const LUDO_COLOR_NAMES: Record<LudoColor, string> = {
  red: 'Red',
  green: 'Green',
  yellow: 'Yellow',
  blue: 'Blue',
};
