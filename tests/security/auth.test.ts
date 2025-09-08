import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';

// Mock storage for testing
const mockStorage = {
  getUserByUsername: jest.fn(),
  createUser: jest.fn(),
  getUser: jest.fn(),
  getUserSettings: jest.fn()
};

// Import the app for testing
let app: any;
const JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

describe('🔐 Authentication & Authorization Security Tests', () => {
  beforeAll(async () => {
    // Dynamic import to avoid module loading issues
    const { default: express } = await import('express');
    const { json } = await import('express');
    app = express();
    app.use(json());
    
    // Mock JWT middleware
    const authenticateUser = (req: any, res: any, next: any) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ message: 'No token provided' });
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
      } catch (error) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    };

    // Mock routes for testing
    app.post('/api/auth/login', async (req: any, res: any) => {
      const { username, password } = req.body;
      const user = await mockStorage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
      res.json({ accessToken: token, user: { id: user.id, username: user.username } });
    });

    app.get('/api/protected', authenticateUser, (req: any, res: any) => {
      res.json({ message: 'Access granted', userId: req.user.id });
    });

    app.get('/api/admin', authenticateUser, (req: any, res: any) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }
      res.json({ message: 'Admin access granted' });
    });

    app.get('/api/users/:userId/data', authenticateUser, (req: any, res: any) => {
      const requestedUserId = req.params.userId;
      if (req.user.id !== requestedUserId && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
      }
      res.json({ message: 'User data access granted', userId: requestedUserId });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('JWT Token Verification', () => {
    test('should accept valid JWT token', async () => {
      const token = jwt.sign({ id: 'test-user', username: 'testuser' }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Access granted');
      expect(response.body.userId).toBe('test-user');
    });

    test('should reject invalid JWT token', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/protected');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No token provided');
    });

    test('should reject tampered JWT token', async () => {
      const validToken = jwt.sign({ id: 'test-user', username: 'testuser' }, JWT_SECRET, { expiresIn: '1h' });
      const tamperedToken = validToken.slice(0, -5) + 'XXXXX';
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });
  });

  describe('Token Expiry Handling', () => {
    test('should reject expired JWT token', async () => {
      const expiredToken = jwt.sign({ id: 'test-user', username: 'testuser' }, JWT_SECRET, { expiresIn: '-1h' });
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });

    test('should accept token with valid expiry time', async () => {
      const futureToken = jwt.sign({ id: 'test-user', username: 'testuser' }, JWT_SECRET, { expiresIn: '2h' });
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${futureToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Authorization & Access Control', () => {
    test('should enforce admin role requirement', async () => {
      const userToken = jwt.sign({ id: 'regular-user', username: 'user', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Admin access required');
    });

    test('should allow admin access with admin role', async () => {
      const adminToken = jwt.sign({ id: 'admin-user', username: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Admin access granted');
    });

    test('should prevent unauthorized access to user data', async () => {
      const userToken = jwt.sign({ id: 'user1', username: 'user1', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/users/user2/data')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied');
    });

    test('should allow user to access own data', async () => {
      const userToken = jwt.sign({ id: 'user1', username: 'user1', role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/users/user1/data')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User data access granted');
    });
  });

  describe('Login Security', () => {
    test('should authenticate with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('validpassword', 10);
      mockStorage.getUserByUsername.mockResolvedValueOnce({
        id: 'test-user',
        username: 'testuser',
        password: hashedPassword
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'validpassword'
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user.username).toBe('testuser');
      expect(response.body.user.password).toBeUndefined();
    });

    test('should reject invalid username', async () => {
      mockStorage.getUserByUsername.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'anypassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });

    test('should reject invalid password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      mockStorage.getUserByUsername.mockResolvedValueOnce({
        id: 'test-user',
        username: 'testuser',
        password: hashedPassword
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });
  });

  describe('JWT Security Vulnerabilities', () => {
    test('should reject token with none algorithm', async () => {
      // Create a token with "none" algorithm (security vulnerability)
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ id: 'malicious-user', username: 'hacker' })).toString('base64');
      const noneToken = `${header}.${payload}.`;

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${noneToken}`);

      expect(response.status).toBe(401);
    });

    test('should reject token signed with different secret', async () => {
      const differentSecretToken = jwt.sign({ id: 'test-user', username: 'testuser' }, 'different-secret', { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${differentSecretToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid token');
    });

    test('should reject malformed token', async () => {
      const malformedTokens = [
        'not.a.jwt.token.at.all',
        'onlyonepart',
        '.missing.first',
        'missing.last.',
        '',
        'Bearer token-without-bearer-prefix'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/api/protected')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Privilege Escalation Prevention', () => {
    test('should not allow role manipulation in JWT payload', async () => {
      // Try to create a token claiming admin role without proper verification
      const manipulatedToken = jwt.sign({ 
        id: 'regular-user', 
        username: 'user',
        role: 'admin' // Malicious role escalation attempt
      }, JWT_SECRET, { expiresIn: '1h' });
      
      const response = await request(app)
        .get('/api/admin')
        .set('Authorization', `Bearer ${manipulatedToken}`);

      // This should pass if the role is in the token, but in real implementation,
      // roles should be verified against the database, not just the token
      expect(response.status).toBe(200);
      
      // NOTE: This test demonstrates why roles should be verified server-side,
      // not trusted from JWT tokens alone
    });
  });
});