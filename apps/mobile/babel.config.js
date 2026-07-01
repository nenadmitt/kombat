module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 ships its Babel plugin via react-native-worklets.
  // It MUST be the last plugin.
  plugins: ['react-native-worklets/plugin'],
};
