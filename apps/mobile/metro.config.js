const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Monorepo-aware Metro config.
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // NOTE: keep hierarchical lookup enabled (default). Disabling it breaks
    // packages that rely on a *nested* dep version (e.g. reanimated needs
    // semver@7 nested under its own node_modules, while root has v6 hoisted).
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
