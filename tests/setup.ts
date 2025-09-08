import { jest } from '@jest/globals';

// Setup global test environment
beforeAll(async () => {
  // Disable console.log during tests unless explicitly needed
  if (process.env.NODE_ENV !== 'debug') {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  // Cleanup after all tests
});