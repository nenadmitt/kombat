/**
 * App color palette and shared design tokens.
 * Keep raw hex values here so screens reference names, not literals.
 */
export const colors = {
  /** App / screen background. */
  background: '#0b0b0e',
  /** Elevated surface (cards, hero placeholder). */
  surface: '#15151b',
  /** Muted chip/icon-circle background (wallet screen). */
  surfaceMuted: '#1c1c24',
  /** Card background/border (wallet screen asset cards, action buttons). */
  cardBackground: 'rgba(255, 255, 255, 0.05)',
  cardBorder: 'rgba(255, 255, 255, 0.1)',
  /** Primary text on dark backgrounds. */
  textPrimary: '#ffffff',
  /** Secondary / helper text. */
  textMuted: '#94a3b8',
  /** Faint text (input placeholders, fine print). */
  textFaint: '#475569',
  /** Brand gradient stops. */
  brandStart: '#8b5cf6',
  brandEnd: '#3b82f6',
  /** KOMBAT (native token) accent — amber. */
  kombatAccent: '#f59e0b',
  /** Destructive actions (sign out). */
  danger: '#ef4444',
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
  /** Wallet asset/action cards. */
  card: 20,
  /** Smaller cards (profile stats/settings rows). */
  chip: 16,
  /** Fully-rounded chips (e.g. address pill). */
  pill: 100,
} as const;

/** Shared spacing scale (px). */
export const spacing = {
  xs: 6,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
} as const;
