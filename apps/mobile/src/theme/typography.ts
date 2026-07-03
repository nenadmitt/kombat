/**
 * Sora (Google Fonts) weight files linked natively — see assets/fonts and
 * react-native.config.js. Each weight is registered as its own font family
 * (Google's own naming), so weights are selected via `fontFamily`, not
 * `fontWeight` — custom fonts don't get synthesized bold/semibold by RN.
 */
export const fonts = {
  regular: 'Sora-Regular',
  semiBold: 'Sora-SemiBold',
  bold: 'Sora-Bold',
  extraBold: 'Sora-ExtraBold',
} as const;
