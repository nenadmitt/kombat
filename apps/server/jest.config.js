module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  // `uuid` is ESM-only, so it has to be transpiled rather than ignored.
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Money tests hold row locks on one database; parallel workers would deadlock.
  maxWorkers: 1,
  testTimeout: 30_000,
};
