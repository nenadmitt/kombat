module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Must stay the last plugin: Reanimated 4 ships it via react-native-worklets.
  plugins: ['react-native-worklets/plugin'],
};
