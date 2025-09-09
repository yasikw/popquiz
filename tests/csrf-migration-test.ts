/**
 * CSRF Migration Test Suite
 * Tests the enhanced custom CSRF implementation after removing deprecated csurf library
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { 
  generateCSRFTokenEndpoint,
  csrfProtection,
  refreshCSRFToken,
  getCSRFStats
} from '../server/middleware/csrf';

describe('Enhanced CSRF Protection (Post-csurf Migration)', () => {
  let app: express.Application;
  let agent: request.SuperAgentTest;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Setup test routes
    app.get('/api/csrf-token', generateCSRFTokenEndpoint);
    app.post('/api/csrf-token/refresh', refreshCSRFToken);
    app.post('/api/protected', csrfProtection, (req, res) => {
      res.json({ message: 'CSRF protection passed', data: req.body });
    });
    app.get('/api/public', (req, res) => {
      res.json({ message: 'Public endpoint - no CSRF needed' });
    });
    
    agent = request.agent(app);
  });

  describe('Token Generation', () => {
    test('should generate CSRF token successfully', async () => {
      const response = await agent
        .get('/api/csrf-token')
        .expect(200);

      expect(response.body).toHaveProperty('csrfToken');
      expect(response.body).toHaveProperty('message', 'CSRF token generated successfully');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
      
      // Check that cookie was set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const csrfCookie = cookies.find((cookie: string) => cookie.startsWith('_csrf='));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('HttpOnly');
      expect(csrfCookie).toContain('SameSite=Strict');
    });

    test('should enforce rate limiting for token generation', async () => {
      // Generate tokens rapidly
      const promises = Array(10).fill(0).map(() => 
        agent.get('/api/csrf-token')
      );
      
      const responses = await Promise.all(promises);
      
      // Some requests should eventually be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      if (rateLimitedResponses.length > 0) {
        expect(rateLimitedResponses[0].body).toHaveProperty('code', 'CSRF_RATE_LIMIT');
        expect(rateLimitedResponses[0].body.message).toContain('制限を超えています');
      }
    });
  });

  describe('Token Validation', () => {
    let csrfToken: string;

    beforeEach(async () => {
      const tokenResponse = await agent.get('/api/csrf-token');
      csrfToken = tokenResponse.body.csrfToken;
    });

    test('should accept valid CSRF token', async () => {
      const response = await agent
        .post('/api/protected')
        .set('X-CSRF-Token', csrfToken)
        .send({ test: 'data' })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'CSRF protection passed');
      expect(response.body.data).toEqual({ test: 'data' });
    });

    test('should reject request without CSRF token', async () => {
      const response = await agent
        .post('/api/protected')
        .send({ test: 'data' })
        .expect(403);

      expect(response.body).toHaveProperty('code', 'INVALID_CSRF_TOKEN');
      expect(response.body.message).toContain('CSRFトークンが無効です');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should reject request with invalid CSRF token', async () => {
      const response = await agent
        .post('/api/protected')
        .set('X-CSRF-Token', 'invalid_token_12345')
        .send({ test: 'data' })
        .expect(403);

      expect(response.body).toHaveProperty('code', 'INVALID_CSRF_TOKEN');
    });

    test('should reject request with malformed CSRF token', async () => {
      const response = await agent
        .post('/api/protected')
        .set('X-CSRF-Token', 'not_hex_token!')
        .send({ test: 'data' })
        .expect(403);

      expect(response.body).toHaveProperty('code', 'INVALID_CSRF_TOKEN');
    });

    test('should allow GET requests without CSRF token', async () => {
      const response = await agent
        .get('/api/public')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Public endpoint - no CSRF needed');
    });
  });

  describe('Token Refresh', () => {
    let originalToken: string;

    beforeEach(async () => {
      const tokenResponse = await agent.get('/api/csrf-token');
      originalToken = tokenResponse.body.csrfToken;
    });

    test('should refresh CSRF token successfully', async () => {
      const response = await agent
        .post('/api/csrf-token/refresh')
        .expect(200);

      expect(response.body).toHaveProperty('csrfToken');
      expect(response.body).toHaveProperty('message', 'CSRF token refreshed successfully');
      expect(response.body).toHaveProperty('expiresIn');
      expect(response.body).toHaveProperty('timestamp');
      
      // New token should be different from original
      expect(response.body.csrfToken).not.toBe(originalToken);
      expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should invalidate old token after refresh', async () => {
      // Refresh the token
      const refreshResponse = await agent
        .post('/api/csrf-token/refresh')
        .expect(200);

      const newToken = refreshResponse.body.csrfToken;

      // Old token should no longer work
      await agent
        .post('/api/protected')
        .set('X-CSRF-Token', originalToken)
        .send({ test: 'data' })
        .expect(403);

      // New token should work
      await agent
        .post('/api/protected')
        .set('X-CSRF-Token', newToken)
        .send({ test: 'data' })
        .expect(200);
    });
  });

  describe('Security Features', () => {
    test('should have proper token format', async () => {
      const response = await agent.get('/api/csrf-token');
      const token = response.body.csrfToken;
      
      // Token should be 64 character hex string
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(token).toHaveLength(64);
    });

    test('should set secure cookie attributes', async () => {
      const response = await agent.get('/api/csrf-token');
      const cookies = response.headers['set-cookie'];
      const csrfCookie = cookies.find((cookie: string) => cookie.startsWith('_csrf='));
      
      expect(csrfCookie).toContain('HttpOnly');
      expect(csrfCookie).toContain('SameSite=Strict');
      expect(csrfCookie).toContain('Path=/');
    });

    test('should generate unique tokens', async () => {
      const tokens = new Set();
      
      // Generate multiple tokens
      for (let i = 0; i < 10; i++) {
        const response = await request(app).get('/api/csrf-token');
        tokens.add(response.body.csrfToken);
      }
      
      // All tokens should be unique
      expect(tokens.size).toBe(10);
    });
  });

  describe('Error Handling', () => {
    test('should provide detailed error information', async () => {
      const response = await agent
        .post('/api/protected')
        .send({ test: 'data' })
        .expect(403);

      expect(response.body).toHaveProperty('error', 'CSRF token validation failed');
      expect(response.body).toHaveProperty('code', 'INVALID_CSRF_TOKEN');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.message).toContain('CSRFトークンが無効です');
    });

    test('should handle missing cookie gracefully', async () => {
      // Make request without any cookies
      const response = await request(app)
        .post('/api/protected')
        .set('X-CSRF-Token', 'some_token')
        .send({ test: 'data' })
        .expect(403);

      expect(response.body).toHaveProperty('code', 'INVALID_CSRF_TOKEN');
    });
  });

  describe('Performance and Statistics', () => {
    test('should provide CSRF statistics', () => {
      const stats = getCSRFStats();
      
      expect(stats).toHaveProperty('activeTokens');
      expect(stats).toHaveProperty('oldestTokenAge');
      expect(stats).toHaveProperty('tokensPerIP');
      expect(typeof stats.activeTokens).toBe('number');
      expect(typeof stats.oldestTokenAge).toBe('number');
      expect(typeof stats.tokensPerIP).toBe('object');
    });
  });
});

// Integration test with actual application
describe('CSRF Integration with Quiz Application', () => {
  test('should protect quiz generation endpoints', async () => {
    const app = require('../server/index.ts').default || require('../server/index.ts');
    const agent = request.agent(app);

    // Get CSRF token first
    const tokenResponse = await agent.get('/api/csrf-token').expect(200);
    const csrfToken = tokenResponse.body.csrfToken;

    // Try to access protected quiz endpoint with valid token
    const quizData = {
      content: 'Test content for quiz generation',
      difficulty: 'beginner',
      questionCount: 5,
      timeLimit: 300
    };

    // This should work with valid CSRF token
    const response = await agent
      .post('/api/quiz/generate-from-text')
      .set('X-CSRF-Token', csrfToken)
      .send(quizData);

    // The response will depend on whether user is authenticated
    // but it should not fail due to CSRF protection
    expect([200, 401, 403]).toContain(response.status);
    
    if (response.status === 403) {
      // If it's 403, it should not be due to CSRF (since we provided valid token)
      expect(response.body.code).not.toBe('INVALID_CSRF_TOKEN');
    }
  });
});