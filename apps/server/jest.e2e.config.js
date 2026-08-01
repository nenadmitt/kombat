/**
 * Integration suite: boots the real Nest app on an ephemeral port and drives it
 * over HTTP + socket.io against a real Postgres. Kept out of `jest.config.js`
 * (which is rootDir `src` and matches `.spec.ts`) so `npm test` stays a fast
 * unit run that needs no database.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // One app, one database, one deadline schedule — parallel workers would
  // truncate each other's rows mid-test.
  maxWorkers: 1,
  testTimeout: 30_000,
};
