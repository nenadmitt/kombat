import type { TextStyle } from 'react-native';

/**
 * Three type roles, all on Sora (Google Fonts) — each weight linked natively
 * as its own family (Google's naming), so weights are chosen via `fontFamily`,
 * not `fontWeight`, because custom fonts don't get synthesized bold/semibold by
 * RN. See assets/fonts and react-native.config.js.
 *
 * The whole system is one family, Sora, matching the pre-redesign look:
 * - `display` — headings & titles.
 * - `body`    — paragraphs, descriptions, labels.
 * - `mono`    — numbers, codes, and uppercase micro-labels (balances, stakes,
 *               room codes, section eyebrows). Not truly monospaced — kept as a
 *               separate role so it can diverge again later without touching
 *               call sites.
 */
export const display = {
  regular: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
  extraBold: 'Sora-ExtraBold',
} as const;

/**
 * Body text shares the Sora family with display. The baseline is SemiBold for
 * more presence; `light` keeps true Regular and `medium` the intermediate
 * Medium weight where needed.
 */
export const body = {
  regular: 'Sora-SemiBold',
  light: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
  extraBold: 'Sora-ExtraBold',
} as const;

export const mono = {
  regular: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
} as const;

/**
 * Backwards-compatible alias — existing screens/components import `fonts` and
 * expect the Sora weight keys. Kept pointing at the body (Sora) family so
 * nothing breaks while screens migrate to the semantic `type` presets below.
 */
export const fonts = body;

/**
 * Semantic text presets. Spread one into a `Text` style and override sparingly
 * (e.g. `color`). This is the single source of truth for the type scale so
 * screens stay visually consistent.
 */
export const type = {
  /** Hero display — onboarding titles, "Play. Compete. Win". */
  hero: {
    fontFamily: display.extraBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  /** Screen titles — "Wallet", "Match History". */
  title: {
    fontFamily: display.extraBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  /** Section / card headings. */
  heading: {
    fontFamily: display.extraBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  /** Sub-heading / list-item title. */
  subheading: {
    fontFamily: display.extraBold,
    fontSize: 16,
    lineHeight: 22,
  },
  /** Body copy. */
  body: {
    fontFamily: body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  /** Smaller helper / secondary copy. */
  caption: {
    fontFamily: body.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  /** Button / action label. */
  button: {
    fontFamily: body.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  /** Uppercase mono eyebrow — "TOTAL BALANCE", "SELECT GAME". */
  label: {
    fontFamily: mono.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  /** Mono for numbers/codes at body size. */
  mono: {
    fontFamily: mono.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  /** Big mono metric — balances, earnings. */
  metric: {
    fontFamily: mono.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
} satisfies Record<string, TextStyle>;
