import type { LudoColor } from '@gaming-platform/core';

import { colors } from '../../theme/colors';

/** Solid fill per seat color (theme tokens, from the design). */
export const LUDO_COLOR_HEX: Record<LudoColor, string> = {
  red: colors.ludoRed,
  green: colors.ludoGreen,
  yellow: colors.ludoYellow,
  blue: colors.ludoBlue,
};

/** rgba(...) builders per color - Skia wants concrete strings and the theme
 *  tokens are hex, so the channel triples live here once. */
const RGB: Record<LudoColor, [number, number, number]> = {
  red: [255, 90, 110],
  green: [62, 224, 143],
  yellow: [245, 184, 41],
  blue: [122, 165, 255],
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
