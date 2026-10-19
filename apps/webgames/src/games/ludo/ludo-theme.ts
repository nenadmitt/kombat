import type { LudoAbilityKind, LudoColor } from '@gaming-platform/core';

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
  blue: [122, 165, 255],
};

export const LUDO_COLOR_HEX: Record<LudoColor, string> = {
  red: '#ff5a6e',
  green: '#3ee08f',
  yellow: '#f5b829',
  blue: '#7aa5ff',
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

export const ABILITY_LABELS: Record<LudoAbilityKind, string> = {
  launcher: 'Launcher',
  jump: 'Extra Jump',
  teleport: 'Teleport',
  shield: 'Shield',
};

export const ABILITY_COLORS: Record<LudoAbilityKind, string> = {
  launcher: 'var(--lime)',
  jump: 'var(--gold)',
  teleport: 'var(--ludo-blue)',
  shield: 'var(--shield)',
};
