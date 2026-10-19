export const colors = {
  background: '#161826',
  canvas: '#101120',
  surface: '#232532',
  surfaceMuted: '#1B1D2B',
  cardBackground: '#232532',
  cardBorder: 'rgba(233, 233, 237, 0.09)',
  border: 'rgba(233, 233, 237, 0.09)',
  borderStrong: 'rgba(233, 233, 237, 0.16)',

  accent: '#8ee05a',
  onAccent: '#0b0c14',
  accentSoft: 'rgba(142, 224, 90, 0.14)',
  accentBorder: 'rgba(142, 224, 90, 0.34)',
  accentLight: '#c0f394',

  accent100: '#f2fee9',
  accent200: '#ddfcc6',
  accent300: '#c0f394',
  accent400: '#a0e962',
  accent500: '#83d440',
  accent600: '#63a72c',
  accent700: '#4c8024',
  accent800: '#2f4d18',
  accent900: '#1d3010',

  success: '#3ee08f',
  successSoft: 'rgba(62, 224, 143, 0.15)',
  danger: '#ff5a6e',
  dangerSoft: 'rgba(255, 90, 110, 0.16)',
  dangerBorder: 'rgba(255, 90, 110, 0.4)',
  dangerLight: '#ff8792',
  gold: '#f5b829',
  goldSoft: 'rgba(245, 184, 41, 0.15)',
  goldBorder: 'rgba(245, 184, 41, 0.4)',
  info: '#5b8def',

  ludoRed: '#ff5a6e',
  ludoGreen: '#3ee08f',
  ludoYellow: '#f5b829',
  ludoBlue: '#7aa5ff',

  chromaCrimson: '#E5484D',
  chromaAmber: '#F5A524',
  chromaJade: '#30A46C',
  chromaAzure: '#3B82F6',

  salvoGround: '#0b0c14',
  salvoPanel: '#141724',
  salvoSkyMid: '#101526',
  salvoSkyHorizon: '#202f2d',
  salvoTerrain: '#202e1f',
  salvoEnemy: '#cdcfd8',
  salvoEnemyTread: '#7d808c',
  salvoWreck: '#4a4d59',
  salvoTread: '#4e7b31',

  textPrimary: '#e9e9ed',
  textSecondary: '#9a9ba6',
  /** Lightened off the design's grey so 11px uppercase labels clear 4.5:1. */
  textMuted: '#8a8b9a',
  /** Lightened from the design's #4a4b57 (2:1, unreadable) to ~4.3:1 on the background. */
  textFaint: '#7c7d8a',

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

export const brandGradient = {
  colors: ['#a0e962', '#63a72c'],
  positions: [0, 1],
} as const;

export const goldGradient = {
  colors: ['#f8cf5c', '#e0a015'],
  positions: [0.15, 0.85],
} as const;

export const successGradient = {
  colors: ['#3ee08f', '#22b56e'],
  positions: [0, 1],
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 100,
  logo: 24,
  hero: 28,
  button: 16,
  card: 20,
  chip: 12,
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
