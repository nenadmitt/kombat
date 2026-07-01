/**
 * App color palette and shared design tokens.
 * Keep raw hex values here so screens reference names, not literals.
 */
export const colors = {
  /** App / screen background. */
  background: '#0b0b0e',
  /** Elevated surface (cards, hero placeholder). */
  surface: '#15151b',
  /** Primary text on dark backgrounds. */
  textPrimary: '#ffffff',
  /** Secondary / helper text. */
  textMuted: '#94a3b8',
  /** Brand gradient stops. */
  brandStart: '#8b5cf6',
  brandEnd: '#3b82f6',
} as const;

/** Brand gradient (purple → blue), matching the auth-screen design. */
export const brandGradient = {
  colors: [colors.brandStart, colors.brandEnd],
  positions: [0.25, 0.75],
} as const;

/** Shared corner radii. */
export const radius = {
  logo: 24,
  hero: 32,
  button: 28,
} as const;

/** Shared spacing scale (px). */
export const spacing = {
  xs: 6,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;
