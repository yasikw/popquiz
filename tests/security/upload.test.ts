import request from 'supertest';
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';

let app: any;

describe('📤 File Upload Security Tests', () => {
  beforeAll(async () => {
    const { default: express } = await import('express');
    const { default: multer } = await import('multer');
    
    app = express();
    
    // Mock multer configuration for testing
    const storage = multer.memoryStorage();
    const upload = multer({ 
      storage,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'text/plain'];
        const allowedExtensions = ['.pdf', '.txt'];
        
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('File type not allowed'));
        }
      }
    });

    // File upload endpoint
    app.post('/api/upload/quiz-content', upload.single('file'), (req: any, res: any) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Security validations
      const file = req.file;
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (file.size > maxSize) {
        return res.status(400).json({ error: 'File too large' });
      }

      // Check for dangerous file patterns
      const dangerousPatterns = [
        /\x00/, // Null byte
        /\.php/i,
        /\.jsp/i,
        /\.asp/i,
        /\.exe/i,
        /\.sh/i,
        /\.bat/i,
        /\.com/i,
        /\.scr/i,
        /\.vbs/i,
        /\.js$/i, // JavaScript files
        /\.html?/i,
        /<script/i,
        /javascript:/i,
        /vbscript:/i
      ];

      const filename = file.originalname;
      const buffer = file.buffer;
      
      for (const pattern of dangerousPatterns) {
        if (pattern.test(filename) || pattern.test(buffer.toString('utf8', 0, 1000))) {
          return res.status(400).json({ error: 'Dangerous file content detected' });
        }
      }

      res.json({
        message: 'File uploaded successfully',
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
    });

    // Vulnerable upload endpoint for testing
    app.post('/api/upload/vulnerable', upload.single('file'), (req: any, res: any) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Deliberately vulnerable - accepts any file type
      res.json({
        message: 'File uploaded (vulnerable endpoint)',
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        content: req.file.buffer.toString('utf8').substring(0, 100)
      });
    });
  });

  describe('File Type Validation', () => {
    test('should accept valid PDF files', async () => {
      // Create a mock PDF buffer
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n');
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', pdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('File uploaded successfully');
    });

    test('should accept valid text files', async () => {
      const textContent = 'This is a test text file content.';
      const textBuffer = Buffer.from(textContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', textBuffer, { filename: 'test.txt', contentType: 'text/plain' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('File uploaded successfully');
    });

    test('should reject executable files', async () => {
      const executableExtensions = ['.exe', '.bat', '.com', '.scr', '.msi', '.dll'];
      
      for (const ext of executableExtensions) {
        const maliciousBuffer = Buffer.from('MZ'); // Executable header
        
        const response = await request(app)
          .post('/api/upload/quiz-content')
          .attach('file', maliciousBuffer, { 
            filename: `malware${ext}`, 
            contentType: 'application/octet-stream' 
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('File type not allowed');
      }
    });

    test('should reject script files', async () => {
      const scriptTypes = [
        { ext: '.php', content: '<?php echo "hack"; ?>', mimetype: 'application/x-php' },
        { ext: '.jsp', content: '<% System.out.println("hack"); %>', mimetype: 'application/x-jsp' },
        { ext: '.asp', content: '<% Response.Write("hack") %>', mimetype: 'application/x-asp' },
        { ext: '.js', content: 'alert("hack")', mimetype: 'application/javascript' },
        { ext: '.vbs', content: 'MsgBox("hack")', mimetype: 'application/x-vbs' }
      ];

      for (const script of scriptTypes) {
        const scriptBuffer = Buffer.from(script.content);
        
        const response = await request(app)
          .post('/api/upload/quiz-content')
          .attach('file', scriptBuffer, { 
            filename: `script${script.ext}`, 
            contentType: script.mimetype 
          });

        expect(response.status).toBe(400);
      }
    });

    test('should detect MIME type spoofing', async () => {
      // Upload a PHP file with fake PDF MIME type
      const phpContent = '<?php system($_GET["cmd"]); ?>';
      const phpBuffer = Buffer.from(phpContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', phpBuffer, { 
          filename: 'fake.php', 
          contentType: 'application/pdf' // Fake PDF MIME type
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File type not allowed');
    });
  });

  describe('File Size Validation', () => {
    test('should reject files exceeding size limit', async () => {
      // Create a large buffer (11MB)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'A');
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', largeBuffer, { filename: 'large.txt', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('too large');
    });

    test('should accept files within size limit', async () => {
      // Create a 1MB file
      const normalBuffer = Buffer.alloc(1024 * 1024, 'A');
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', normalBuffer, { filename: 'normal.txt', contentType: 'text/plain' });

      expect(response.status).toBe(200);
    });
  });

  describe('Malicious File Content Detection', () => {
    test('should detect embedded scripts in files', async () => {
      const maliciousContent = `
        This looks like a normal text file.
        But it contains: <script>alert('XSS')</script>
        And some other content.
      `;
      const maliciousBuffer = Buffer.from(maliciousContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', maliciousBuffer, { filename: 'malicious.txt', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Dangerous file content detected');
    });

    test('should detect null byte injection', async () => {
      const nullByteContent = 'normal.txt\x00.php';
      const nullByteBuffer = Buffer.from(nullByteContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', nullByteBuffer, { filename: 'normal.txt\x00.php', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Dangerous file content detected');
    });

    test('should detect JavaScript URLs', async () => {
      const jsUrlContent = 'Click here: javascript:alert("hack")';
      const jsUrlBuffer = Buffer.from(jsUrlContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', jsUrlBuffer, { filename: 'suspicious.txt', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Dangerous file content detected');
    });

    test('should detect VBScript content', async () => {
      const vbsContent = 'On Error Resume Next: CreateObject("WScript.Shell").Run "calc.exe"';
      const vbsBuffer = Buffer.from(vbsContent);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', vbsBuffer, { filename: 'document.txt', contentType: 'text/plain' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Dangerous file content detected');
    });
  });

  describe('Path Traversal Prevention', () => {
    test('should prevent directory traversal in filenames', async () => {
      const traversalFilenames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc//passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc%252fpasswd',
        '....\\\\....\\\\....\\\\windows\\\\system32\\\\config\\\\sam'
      ];

      for (const filename of traversalFilenames) {
        const buffer = Buffer.from('safe content');
        
        const response = await request(app)
          .post('/api/upload/quiz-content')
          .attach('file', buffer, { filename, contentType: 'text/plain' });

        // Should be rejected due to dangerous filename patterns
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Virus/Malware Simulation', () => {
    test('should detect EICAR test string', async () => {
      // EICAR test string - standard antivirus test signature
      const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      const eicarBuffer = Buffer.from(eicarString);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', eicarBuffer, { filename: 'test.txt', contentType: 'text/plain' });

      // Should be flagged as dangerous content
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Dangerous file content detected');
    });
  });

  describe('Double Extension Attack', () => {
    test('should prevent double extension attacks', async () => {
      const doubleExtensions = [
        'document.pdf.exe',
        'image.jpg.php',
        'readme.txt.jsp',
        'data.csv.asp',
        'archive.zip.com'
      ];

      for (const filename of doubleExtensions) {
        const buffer = Buffer.from('malicious content');
        
        const response = await request(app)
          .post('/api/upload/quiz-content')
          .attach('file', buffer, { filename, contentType: 'text/plain' });

        expect(response.status).toBe(400);
      }
    });
  });

  describe('Archive Bomb Prevention', () => {
    test('should handle zip bomb attempts', async () => {
      // Simulate a zip bomb (highly compressed malicious archive)
      const zipBombHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP header
      const repeatedData = Buffer.alloc(10000, 0x00); // Highly compressible data
      const zipBombBuffer = Buffer.concat([zipBombHeader, repeatedData]);
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', zipBombBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });

      // Should be rejected as not a valid PDF
      expect(response.status).toBe(400);
    });
  });

  describe('Vulnerable Upload Endpoint Test', () => {
    test('should demonstrate vulnerability in unprotected endpoint', async () => {
      const phpShell = '<?php if(isset($_GET["cmd"])) { system($_GET["cmd"]); } ?>';
      const phpBuffer = Buffer.from(phpShell);
      
      const response = await request(app)
        .post('/api/upload/vulnerable')
        .attach('file', phpBuffer, { filename: 'shell.php', contentType: 'text/plain' });

      expect(response.status).toBe(200);
      expect(response.body.filename).toBe('shell.php');
      expect(response.body.content).toContain('<?php');
      
      console.warn('⚠️ Vulnerable endpoint accepted malicious PHP file');
    });
  });

  describe('Content-Type Validation', () => {
    test('should validate Content-Type header', async () => {
      const textBuffer = Buffer.from('Normal text content');
      
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', textBuffer, { filename: 'test.txt', contentType: 'application/x-malware' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File type not allowed');
    });

    test('should require proper extension-MIME type matching', async () => {
      const textBuffer = Buffer.from('This is text content');
      
      // Try to upload text file with PDF extension
      const response = await request(app)
        .post('/api/upload/quiz-content')
        .attach('file', textBuffer, { filename: 'document.pdf', contentType: 'text/plain' });

      expect(response.status).toBe(400);
    });
  });
});