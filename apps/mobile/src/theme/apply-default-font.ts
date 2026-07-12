import { Text, TextInput } from 'react-native';

import { fonts } from './typography';

/**
 * Makes Sora the default font app-wide by patching the default `style` for
 * `Text`/`TextInput`, instead of touching every screen's stylesheet. Any
 * screen-level `fontFamily` still wins - this only fills in the default.
 * Must be imported once, before any component renders (see index.js).
 */
export function applyDefaultFont(): void {
  // react-native's own type defs don't declare defaultProps on these
  // components even though the runtime supports it.
  const AnyText = Text as unknown as { defaultProps?: { style?: unknown } };
  const AnyTextInput = TextInput as unknown as {
    defaultProps?: { style?: unknown };
  };

  AnyText.defaultProps = AnyText.defaultProps ?? {};
  AnyText.defaultProps.style = [
    { fontFamily: fonts.regular },
    AnyText.defaultProps.style,
  ];

  AnyTextInput.defaultProps = AnyTextInput.defaultProps ?? {};
  AnyTextInput.defaultProps.style = [
    { fontFamily: fonts.regular },
    AnyTextInput.defaultProps.style,
  ];
}
