const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Workarounds required by @privy-io/expo (see Privy RN installation docs):
 * - `isows` / `zustand` ship package exports that break under Metro — disable
 *   package exports resolution for them.
 * - `jose` must resolve to its browser build.
 */
const resolveRequestWithPackageExports = (context, moduleName, platform) => {
  if (moduleName === 'isows' || moduleName.startsWith('zustand')) {
    const ctx = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  if (moduleName === 'jose') {
    const ctx = {
      ...context,
      unstable_conditionNames: ['browser'],
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

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
    resolveRequest: resolveRequestWithPackageExports,
    // NOTE: keep hierarchical lookup enabled (default). Disabling it breaks
    // packages that rely on a *nested* dep version (e.g. reanimated needs
    // semver@7 nested under its own node_modules, while root has v6 hoisted).
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
