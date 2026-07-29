/**
 * Kombat design tokens - the "Acid Lime on Nocturne" system: a blue-grey dark
 * ground with a single acid-lime accent carried through a 100-900 tonal ramp,
 * plus gold as the secondary accent (KOMBAT token, achievement badges). Keep
 * raw values here so screens reference names, not literals. Legacy token names
 * are preserved (re-pointed to the new palette) so older game screens keep
 * compiling while they migrate.
 */
export const colors = {
  // ---- Canvas & surfaces -------------------------------------------------
  /** App background - the Nocturne blue-grey ground. */
  background: '#161826',
  /** Root canvas behind raised chrome (tab bar), one step darker than bg. */
  canvas: '#101120',
  /** Elevated surface (cards, sheets, list rows). */
  surface: '#232532',
  /** Muted surface (inputs, chips, icon tiles) - a step below surface. */
  surfaceMuted: '#1B1D2B',
  /** Card fill/border used across the app. */
  cardBackground: '#232532',
  // Experiment: card borders removed - surfaces separate by fill alone.
  // Revert to 'rgba(233, 233, 237, 0.09)' to bring the hairline back.
  cardBorder: 'transparent',
  /** Slightly stronger hairline for emphasis (the Nocturne divider). */
  border: 'rgba(233, 233, 237, 0.09)',
  borderStrong: 'rgba(233, 233, 237, 0.16)',

  // ---- Accent (acid lime) ------------------------------------------------
  /** Primary accent. */
  accent: '#8ee05a',
  /** Text/icon color that sits on a filled accent surface (near-black). */
  onAccent: '#0b0c14',
  /** Tinted accent background (tinted buttons, selected chips, highlights). */
  accentSoft: 'rgba(142, 224, 90, 0.14)',
  /** Accent hairline/border. */
  accentBorder: 'rgba(142, 224, 90, 0.34)',
  /** Lighter accent for text/icons on dark tinted surfaces (accent-300). */
  accentLight: '#c0f394',

  // ---- Accent tonal ramp (OKLCH-derived, 100 lightest to 900 darkest) ----
  // Dark steps (700-900) for tinted fills/borders on the dark ground; 500 is
  // the base; light steps (100-300) for text/icons on those tints.
  accent100: '#f2fee9',
  accent200: '#ddfcc6',
  accent300: '#c0f394',
  accent400: '#a0e962',
  accent500: '#83d440',
  accent600: '#63a72c',
  accent700: '#4c8024',
  accent800: '#2f4d18',
  accent900: '#1d3010',

  // ---- Semantic ----------------------------------------------------------
  /** Positive - wins, gains, "your turn". */
  success: '#3ee08f',
  successSoft: 'rgba(62, 224, 143, 0.15)',
  /** Negative - losses, destructive. */
  danger: '#ff5a6e',
  dangerSoft: 'rgba(255, 90, 110, 0.16)',
  /** Lighter red for text/icons on a dark red tint (the "INCOMING" strip). */
  dangerLight: '#ff8792',
  /** Gold - the secondary accent: earnings, achievements, KOMBAT token. */
  gold: '#f5b829',
  goldSoft: 'rgba(245, 184, 41, 0.15)',
  /** Blue - informational (alt accent). */
  info: '#5b8def',

  // ---- Ludo player colors (harmonised to the Acid Lime palette) ----------
  ludoRed: '#ff5a6e',
  ludoGreen: '#3ee08f',
  ludoYellow: '#f5b829',
  ludoBlue: '#5b8def',

  // ---- Chroma Clash suit colors (from the Chroma Clash design) -----------
  chromaCrimson: '#E5484D',
  chromaAmber: '#F5A524',
  chromaJade: '#30A46C',
  chromaAzure: '#3B82F6',

  // ---- Salvo battlefield -------------------------------------------------
  // Salvo runs on its own near-black ground rather than the app background,
  // so the lit horizon and the accent-washed terrain read at full contrast.
  /** Salvo's screen ground and the sky's top stop. */
  salvoGround: '#0b0c14',
  /** Salvo's control cards (angle, power, inert banners). */
  salvoPanel: '#141724',
  /** Sky mid stop, then the accent-washed horizon behind the ridge. */
  salvoSkyMid: '#101526',
  salvoSkyHorizon: '#202f2d',
  /** The playable, destructible ground - accent washed into the ground. */
  salvoTerrain: '#202e1f',
  /** Opponent steel, its tread shadow, and a destroyed hull. */
  salvoEnemy: '#cdcfd8',
  salvoEnemyTread: '#7d808c',
  salvoWreck: '#4a4d59',
  /** Tread shadow under the player's own (accent) tank. */
  salvoTread: '#4e7b31',

  // ---- Text --------------------------------------------------------------
  /** Primary text. */
  textPrimary: '#e9e9ed',
  /** Secondary / helper text. */
  textSecondary: '#9a9ba6',
  /** Muted text (labels, subtitles). */
  textMuted: '#71727e',
  /** Faint text (placeholders, fine print, disabled). */
  textFaint: '#4a4b57',

  // ---- Legacy aliases (re-pointed; kept so game code compiles) -----------
  /** @deprecated use `accent`. */
  brandStart: '#8ee05a',
  /** @deprecated use `accent`. */
  brandEnd: '#8ee05a',
  /** @deprecated use `accentLight`. */
  brandLight: '#c0f394',
  /** @deprecated use `gold`. */
  kombatAccent: '#f5b829',
  /** @deprecated use `gold`. */
  victoryGold: '#f5b829',
  /** @deprecated use `danger`. */
  defeatRed: '#ff5a6e',
} as const;

/**
 * "Gradient" tokens kept for API compatibility with GradientView callers.
 * The design leans on flat tinted fills, so these are subtle same-hue shifts
 * that keep large fills from looking dead-flat.
 */
export const brandGradient = {
  colors: ['#a0e962', '#63a72c'],
  positions: [0, 1],
} as const;

/** Gold gradient for victory / earnings accents. */
export const goldGradient = {
  colors: ['#f8cf5c', '#e0a015'],
  positions: [0.15, 0.85],
} as const;

/** Positive-action gradient (e.g. Triple Cut's NEXT ROUND, per its design). */
export const successGradient = {
  colors: ['#3ee08f', '#22b56e'],
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
