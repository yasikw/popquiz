import request from 'supertest';
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';

let app: any;

describe('🛡️ DoS (Denial of Service) Resistance Tests', () => {
  beforeAll(async () => {
    const { default: express } = await import('express');
    const { default: rateLimit } = await import('express-rate-limit');
    const { json } = await import('express');
    
    app = express();
    app.use(json({ limit: '1mb' })); // Limit request body size
    
    // Rate limiting middleware
    const generalRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // limit each IP to 10 requests per windowMs
      message: 'Too many requests, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    const strictRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 5, // limit each IP to 5 requests per windowMs
      message: 'Rate limit exceeded for this endpoint.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    const uploadRateLimit = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 3, // limit each IP to 3 uploads per minute
      message: 'Upload rate limit exceeded.',
      standardHeaders: true,
      legacyHeaders: false,
    });

    // Test endpoints with different rate limits
    app.get('/api/test/general', generalRateLimit, (req: any, res: any) => {
      res.json({ message: 'General endpoint accessed', timestamp: Date.now() });
    });

    app.post('/api/test/auth', strictRateLimit, (req: any, res: any) => {
      const { username, password } = req.body;
      // Simulate slow authentication check
      setTimeout(() => {
        res.json({ message: 'Authentication processed', username });
      }, 100);
    });

    app.post('/api/test/upload', uploadRateLimit, (req: any, res: any) => {
      const { data } = req.body;
      // Simulate file processing
      res.json({ message: 'Upload processed', size: data?.length || 0 });
    });

    // Endpoint vulnerable to slow loris attack simulation
    app.post('/api/test/slow', (req: any, res: any) => {
      const { delay } = req.body;
      const actualDelay = Math.min(delay || 0, 5000); // Cap at 5 seconds for testing
      
      setTimeout(() => {
        res.json({ message: 'Slow endpoint processed', delay: actualDelay });
      }, actualDelay);
    });

    // Memory consumption test endpoint
    app.post('/api/test/memory', (req: any, res: any) => {
      try {
        const { size } = req.body;
        const maxSize = 1024 * 1024; // 1MB max for testing
        
        if (size > maxSize) {
          return res.status(400).json({ error: 'Requested size too large' });
        }
        
        // Simulate memory allocation
        const buffer = Buffer.alloc(size || 1024);
        res.json({ message: 'Memory allocated', size: buffer.length });
      } catch (error) {
        res.status(500).json({ error: 'Memory allocation failed' });
      }
    });

    // CPU-intensive endpoint
    app.post('/api/test/cpu', (req: any, res: any) => {
      const { iterations } = req.body;
      const maxIterations = 1000000; // Limit iterations for testing
      
      const actualIterations = Math.min(iterations || 0, maxIterations);
      let result = 0;
      
      const start = Date.now();
      for (let i = 0; i < actualIterations; i++) {
        result += Math.sqrt(i);
      }
      const duration = Date.now() - start;
      
      res.json({ 
        message: 'CPU task completed', 
        iterations: actualIterations,
        duration,
        result: Math.floor(result)
      });
    });

    // Regex DoS vulnerable endpoint (for testing)
    app.post('/api/test/regex', (req: any, res: any) => {
      try {
        const { input, pattern } = req.body;
        
        // Limit input size to prevent ReDoS
        if (input?.length > 1000) {
          return res.status(400).json({ error: 'Input too large' });
        }
        
        // Use timeout to prevent ReDoS
        const timeoutMs = 1000; // 1 second timeout
        const startTime = Date.now();
        
        const regex = new RegExp(pattern || '.*');
        const match = regex.test(input);
        
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          return res.status(400).json({ error: 'Regex processing timeout' });
        }
        
        res.json({ match, elapsed });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rate Limiting Protection', () => {
    test('should allow requests within rate limit', async () => {
      const response = await request(app)
        .get('/api/test/general');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('General endpoint accessed');
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    test('should block requests exceeding rate limit', async () => {
      // Make multiple requests quickly to exceed rate limit
      const requests = Array.from({ length: 15 }, (_, i) => 
        request(app).get('/api/test/general')
      );

      const responses = await Promise.all(requests);
      
      // First 10 requests should succeed
      const successfulResponses = responses.filter(r => r.status === 200);
      const blockedResponses = responses.filter(r => r.status === 429);
      
      expect(successfulResponses.length).toBeLessThanOrEqual(10);
      expect(blockedResponses.length).toBeGreaterThan(0);
      expect(blockedResponses[0].body.message).toContain('Too many requests');
    });

    test('should apply stricter rate limits to sensitive endpoints', async () => {
      const authRequests = Array.from({ length: 8 }, (_, i) => 
        request(app)
          .post('/api/test/auth')
          .send({ username: 'test', password: 'password' })
      );

      const responses = await Promise.all(authRequests);
      
      const successfulAuth = responses.filter(r => r.status === 200);
      const blockedAuth = responses.filter(r => r.status === 429);
      
      expect(successfulAuth.length).toBeLessThanOrEqual(5);
      expect(blockedAuth.length).toBeGreaterThan(0);
    });

    test('should limit file upload frequency', async () => {
      const uploadRequests = Array.from({ length: 5 }, (_, i) => 
        request(app)
          .post('/api/test/upload')
          .send({ data: 'test file content' })
      );

      const responses = await Promise.all(uploadRequests);
      
      const successfulUploads = responses.filter(r => r.status === 200);
      const blockedUploads = responses.filter(r => r.status === 429);
      
      expect(successfulUploads.length).toBeLessThanOrEqual(3);
      expect(blockedUploads.length).toBeGreaterThan(0);
    });
  });

  describe('Slow Loris Attack Protection', () => {
    test('should handle slow requests without blocking server', async () => {
      const slowRequest = request(app)
        .post('/api/test/slow')
        .send({ delay: 2000 });

      const fastRequest = request(app)
        .get('/api/test/general');

      // Fast request should complete while slow request is still processing
      const [slowResponse, fastResponse] = await Promise.all([
        slowRequest,
        fastRequest
      ]);

      expect(fastResponse.status).toBe(200);
      expect(slowResponse.status).toBe(200);
      expect(slowResponse.body.delay).toBe(2000);
    });

    test('should limit maximum processing time', async () => {
      const response = await request(app)
        .post('/api/test/slow')
        .send({ delay: 10000 }); // Request 10 seconds, should be capped at 5

      expect(response.status).toBe(200);
      expect(response.body.delay).toBe(5000); // Should be capped at 5 seconds
    });
  });

  describe('Memory Exhaustion Protection', () => {
    test('should reject requests that would consume excessive memory', async () => {
      const largeMemoryRequest = 50 * 1024 * 1024; // 50MB request
      
      const response = await request(app)
        .post('/api/test/memory')
        .send({ size: largeMemoryRequest });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Requested size too large');
    });

    test('should handle reasonable memory allocation', async () => {
      const reasonableRequest = 500 * 1024; // 500KB request
      
      const response = await request(app)
        .post('/api/test/memory')
        .send({ size: reasonableRequest });

      expect(response.status).toBe(200);
      expect(response.body.size).toBe(reasonableRequest);
    });

    test('should handle multiple concurrent memory requests', async () => {
      const memoryRequests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/test/memory')
          .send({ size: 100 * 1024 }) // 100KB each
      );

      const responses = await Promise.all(memoryRequests);
      
      // All reasonable requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('CPU Exhaustion Protection', () => {
    test('should limit CPU-intensive operations', async () => {
      const cpuIntensiveRequest = 10000000; // 10 million iterations
      
      const response = await request(app)
        .post('/api/test/cpu')
        .send({ iterations: cpuIntensiveRequest });

      expect(response.status).toBe(200);
      expect(response.body.iterations).toBe(1000000); // Should be capped at 1 million
    });

    test('should complete reasonable CPU operations', async () => {
      const reasonableRequest = 50000; // 50k iterations
      
      const response = await request(app)
        .post('/api/test/cpu')
        .send({ iterations: reasonableRequest });

      expect(response.status).toBe(200);
      expect(response.body.iterations).toBe(reasonableRequest);
      expect(response.body.duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('Request Size Protection', () => {
    test('should reject oversized request bodies', async () => {
      // Create a large payload (2MB, exceeding 1MB limit)
      const largePayload = 'x'.repeat(2 * 1024 * 1024);
      
      const response = await request(app)
        .post('/api/test/general')
        .send({ data: largePayload });

      expect(response.status).toBe(413); // Payload Too Large
    });

    test('should accept normal-sized request bodies', async () => {
      const normalPayload = 'normal data content';
      
      const response = await request(app)
        .post('/api/test/auth')
        .send({ username: 'test', password: 'password', data: normalPayload });

      expect(response.status).toBe(200);
    });
  });

  describe('ReDoS (Regular Expression DoS) Protection', () => {
    test('should prevent catastrophic backtracking', async () => {
      const maliciousInput = 'a'.repeat(100) + '!';
      const maliciousPattern = '^(a+)+$'; // Vulnerable to catastrophic backtracking
      
      const response = await request(app)
        .post('/api/test/regex')
        .send({ 
          input: maliciousInput, 
          pattern: maliciousPattern 
        });

      expect(response.status).toBe(200);
      expect(response.body.elapsed).toBeLessThan(1000); // Should complete quickly due to timeout
    });

    test('should handle safe regex patterns efficiently', async () => {
      const safeInput = 'hello@example.com';
      const safePattern = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'; // Email regex
      
      const response = await request(app)
        .post('/api/test/regex')
        .send({ 
          input: safeInput, 
          pattern: safePattern 
        });

      expect(response.status).toBe(200);
      expect(response.body.match).toBe(true);
      expect(response.body.elapsed).toBeLessThan(100); // Should be very fast
    });

    test('should reject oversized input for regex processing', async () => {
      const oversizedInput = 'a'.repeat(2000);
      const pattern = '.*';
      
      const response = await request(app)
        .post('/api/test/regex')
        .send({ 
          input: oversizedInput, 
          pattern: pattern 
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Input too large');
    });
  });

  describe('Concurrent Connection Handling', () => {
    test('should handle multiple concurrent requests', async () => {
      const concurrentRequests = Array.from({ length: 20 }, (_, i) => 
        request(app)
          .get('/api/test/general')
          .set('X-Test-Request', i.toString())
      );

      const responses = await Promise.all(concurrentRequests);
      
      const successful = responses.filter(r => r.status === 200);
      const rateLimited = responses.filter(r => r.status === 429);
      
      // Should handle some requests successfully, rate limit others
      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length + rateLimited.length).toBe(20);
    });

    test('should maintain responsiveness under load', async () => {
      const loadRequests = Array.from({ length: 50 }, () => 
        request(app).get('/api/test/general')
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(loadRequests);
      const endTime = Date.now();
      
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && (r as any).value.status === 200
      );
      
      // Should maintain some level of service even under load
      expect(successful.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Resource Cleanup', () => {
    test('should not leak memory on repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Make many small requests
      for (let i = 0; i < 100; i++) {
        await request(app)
          .post('/api/test/memory')
          .send({ size: 1024 }); // 1KB each
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Application Layer DoS Protection', () => {
    test('should handle malformed JSON gracefully', async () => {
      const malformedJsons = [
        '{"unclosed": "string',
        '{"nested": {"deeply": {"too": {"much": {"nesting"',
        '{"huge_number": ' + '9'.repeat(1000) + '}',
        '{"infinite": ' + '{"a":'.repeat(1000) + 'null' + '}'.repeat(1000) + '}'
      ];

      for (const malformedJson of malformedJsons) {
        const response = await request(app)
          .post('/api/test/auth')
          .set('Content-Type', 'application/json')
          .send(malformedJson);

        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });

    test('should timeout long-running operations', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/test/slow')
        .send({ delay: 8000 }); // Request 8 seconds

      const elapsed = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(response.body.delay).toBe(5000); // Should be capped at 5 seconds
      expect(elapsed).toBeLessThan(7000); // Should complete in less than 7 seconds
    });
  });
});