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
  moduleFileExtensions: ['ts', 'js', 'json'],
  // One app, one database: parallel workers would truncate each other's rows.
  maxWorkers: 1,
  testTimeout: 30_000,
};
