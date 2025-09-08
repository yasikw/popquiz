export default async function globalSetup() {
  console.log('🚀 Starting security test suite...');
  
  // Global test setup
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  
  // Disable actual external API calls during testing
  process.env.DISABLE_EXTERNAL_APIS = 'true';
}