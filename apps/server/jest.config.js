/**
 * The ledger tests run against a real Postgres 18 - uuidv7() defaults and row
 * locking are the things under test, so a stubbed driver would prove nothing.
 * They use the app's own database (POSTGRES_* from .env) and truncate only the
 * stake-pot tables; see `src/stake-pot/test/db-harness.ts`.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  // `uuid` v14 is ESM-only and reached from db-utils, so it has to be
  // transpiled rather than ignored like the rest of node_modules.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Money tests hold row locks against one database; parallel workers would
  // deadlock against each other rather than find bugs.
  maxWorkers: 1,
  testTimeout: 30_000,
};
