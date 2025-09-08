export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  }
};