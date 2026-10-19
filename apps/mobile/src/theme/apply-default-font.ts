import { Text, TextInput } from 'react-native';

import { fonts } from './typography';

// Must be imported once, before any component renders.
export function applyDefaultFont(): void {
  // RN's type defs don't declare defaultProps on these components, though the runtime supports it.
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
