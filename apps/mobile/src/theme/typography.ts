import type { TextStyle } from 'react-native';

// Weights are separate families chosen via fontFamily: RN doesn't synthesize bold for custom fonts.
export const display = {
  regular: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
  extraBold: 'Sora-ExtraBold',
} as const;

export const body = {
  regular: 'Sora-SemiBold',
  light: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
  extraBold: 'Sora-ExtraBold',
} as const;

export const brand = {
  bold: 'SpaceGrotesk-Bold',
} as const;

export const mono = {
  regular: 'Sora-Regular',
  medium: 'Sora-Medium',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
} as const;

export const fonts = body;

export const type = {
  hero: {
    fontFamily: display.extraBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: display.extraBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: display.extraBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  subheading: {
    fontFamily: display.extraBold,
    fontSize: 16,
    lineHeight: 22,
  },
  body: {
    fontFamily: body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: body.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    fontFamily: body.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  label: {
    fontFamily: mono.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  mono: {
    fontFamily: mono.medium,
    fontSize: 14,
    lineHeight: 18,
  },
  metric: {
    fontFamily: mono.bold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
} satisfies Record<string, TextStyle>;
