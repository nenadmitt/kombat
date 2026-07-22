/**
 * KryptoKombat design tokens - a flat "inked canvas" system with one focused
 * accent (violet). Keep raw values here so screens reference names, not
 * literals. Legacy token names are preserved (re-pointed to the new palette)
 * so older game screens keep compiling while they migrate.
 */
export const colors = {
  // ---- Canvas & surfaces -------------------------------------------------
  /** App background - flat near-black. */
  background: '#08080B',
  /** Phone/section canvas, one step up from the pure background. */
  canvas: '#0A0A0C',
  /** Elevated surface (cards, sheets). */
  surface: '#111116',
  /** Muted surface (inputs, chips, icon tiles). */
  surfaceMuted: '#17171D',
  /** Card fill/border used across the app. */
  cardBackground: '#111116',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  /** Slightly stronger hairline for emphasis. */
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  // ---- Accent (violet) ---------------------------------------------------
  /** Primary accent. */
  accent: '#7C5CFF',
  /** Text/icon color that sits on a filled accent surface (dark). */
  onAccent: '#0A0A0C',
  /** Tinted accent background (tinted buttons, selected chips, highlights). */
  accentSoft: 'rgba(124, 92, 255, 0.14)',
  /** Accent hairline/border. */
  accentBorder: 'rgba(124, 92, 255, 0.40)',
  /** Lighter accent for text-on-dark accents. */
  accentLight: '#A594FF',

  // ---- Semantic ----------------------------------------------------------
  /** Positive - wins, gains, "your turn". */
  success: '#24E08A',
  successSoft: 'rgba(36, 224, 138, 0.14)',
  /** Negative - losses, destructive. */
  danger: '#FF5468',
  dangerSoft: 'rgba(255, 84, 104, 0.14)',
  /** Gold - earnings, achievements, KOMBAT token. */
  gold: '#FBBF24',
  goldSoft: 'rgba(251, 191, 36, 0.12)',
  /** Blue - informational (alt accent). */
  info: '#2E8BFF',

  // ---- Ludo player colors (from the Ludo Royale design) ------------------
  ludoRed: '#FF4D6D',
  ludoGreen: '#22E39A',
  ludoYellow: '#FBBF24',
  ludoBlue: '#38BDF8',

  // ---- Chroma Clash suit colors (from the Chroma Clash design) -----------
  chromaCrimson: '#E5484D',
  chromaAmber: '#F5A524',
  chromaJade: '#30A46C',
  chromaAzure: '#3B82F6',

  // ---- Text --------------------------------------------------------------
  /** Primary text. */
  textPrimary: '#F5F5F7',
  /** Secondary / helper text. */
  textSecondary: '#9A9AA8',
  /** Muted text (labels, subtitles). */
  textMuted: '#6E6E7C',
  /** Faint text (placeholders, fine print, disabled). */
  textFaint: '#45454F',

  // ---- Legacy aliases (re-pointed; kept so game code compiles) -----------
  /** @deprecated use `accent`. */
  brandStart: '#7C5CFF',
  /** @deprecated use `accent`. */
  brandEnd: '#7C5CFF',
  /** @deprecated use `accentLight`. */
  brandLight: '#A594FF',
  /** @deprecated use `gold`. */
  kombatAccent: '#FBBF24',
  /** @deprecated use `gold`. */
  victoryGold: '#FBBF24',
  /** @deprecated use `danger`. */
  defeatRed: '#FF5468',
} as const;

/**
 * "Gradient" tokens kept for API compatibility with GradientView callers.
 * The design is flat/single-accent, so these are near-solid violet - a subtle
 * top-to-bottom shift keeps large fills from looking dead-flat.
 */
export const brandGradient = {
  colors: ['#8B6DFF', '#6A48F5'],
  positions: [0, 1],
} as const;

/** Gold gradient for victory / earnings accents. */
export const goldGradient = {
  colors: ['#FCD34D', '#F59E0B'],
  positions: [0.15, 0.85],
} as const;

/** Positive-action gradient (e.g. Triple Cut's NEXT ROUND, per its design). */
export const successGradient = {
  colors: ['#22E39A', '#10B981'],
  positions: [0, 1],
} as const;

/** Shared corner radii. */
export const radius = {
  /** Chips / small tiles. */
  sm: 12,
  /** Inputs, list rows. */
  md: 16,
  /** Cards, sheets. */
  lg: 20,
  /** Large hero cards. */
  xl: 28,
  /** Fully-rounded pills. */
  pill: 100,
  // legacy aliases
  logo: 24,
  hero: 28,
  button: 16,
  card: 20,
  chip: 12,
} as const;

/** Shared spacing scale (px). */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
