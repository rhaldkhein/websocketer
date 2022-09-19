const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  roots: ['<rootDir>/src'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {},
  automock: false,
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  moduleNameMapper: {
    './WebSocketer.js': '<rootDir>/src/WebSocketer.ts'
  }
}

export default config
