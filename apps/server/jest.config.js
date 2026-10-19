module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      { tsconfig: { ...require('./tsconfig.json').compilerOptions, allowJs: true } },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Money tests hold row locks on one database; parallel workers would deadlock.
  maxWorkers: 1,
  testTimeout: 30_000,
};
