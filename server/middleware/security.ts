import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Initialize DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

/**
 * Sanitizes user input on the server side
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return purify.sanitize(input.trim(), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  });
}

/**
 * Validates YouTube URLs
 */
export function validateYouTubeURL(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    
    // Only allow HTTPS YouTube URLs
    if (urlObj.protocol !== 'https:') {
      return false;
    }

    const validPatterns = [
      /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https:\/\/(www\.)?youtu\.be\/[\w-]+/,
      /^https:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/
    ];

    return validPatterns.some(pattern => pattern.test(url));
  } catch {
    return false;
  }
}

/**
 * Rate limiting middleware
 */
class RateLimit {
  private attempts: Map<string, number[]> = new Map();
  
  constructor(
    private maxAttempts: number = 10,
    private windowMs: number = 60000 // 1 minute
  ) {}

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const attempts = this.attempts.get(clientId) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validAttempts.length >= this.maxAttempts) {
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.' 
      });
    }

    // Add current attempt
    validAttempts.push(now);
    this.attempts.set(clientId, validAttempts);
    
    next();
  };
}

export const apiRateLimit = new RateLimit(10, 60000).middleware; // 10 requests per minute
export const uploadRateLimit = new RateLimit(5, 60000).middleware; // 5 uploads per minute

/**
 * Input validation middleware for quiz generation
 */
export function validateQuizInput(req: Request, res: Response, next: NextFunction) {
  const { contentType, difficulty, questionCount } = req.body;

  // Validate content type
  const validContentTypes = ['pdf', 'youtube', 'text'];
  if (!validContentTypes.includes(contentType)) {
    return res.status(400).json({ error: 'Invalid content type' });
  }

  // Validate difficulty
  const validDifficulties = ['beginner', 'intermediate', 'advanced'];
  if (!validDifficulties.includes(difficulty)) {
    return res.status(400).json({ error: 'Invalid difficulty level' });
  }

  // Validate question count
  const count = parseInt(questionCount);
  if (isNaN(count) || count < 1 || count > 20) {
    return res.status(400).json({ error: 'Invalid question count (1-20)' });
  }

  // Content-specific validation
  if (contentType === 'youtube') {
    const { youtubeUrl } = req.body;
    if (!validateYouTubeURL(youtubeUrl)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    // Sanitize the URL
    req.body.youtubeUrl = sanitizeInput(youtubeUrl);
  }

  if (contentType === 'text') {
    const { textContent } = req.body;
    if (!textContent || textContent.length < 10 || textContent.length > 10000) {
      return res.status(400).json({ 
        error: 'Text content must be between 10 and 10,000 characters' 
      });
    }
    // Sanitize the text content
    req.body.textContent = sanitizeInput(textContent);
  }

  next();
}

/**
 * File upload validation middleware
 */
export function validateFileUpload(req: Request, res: Response, next: NextFunction) {
  // Only validate file if contentType is pdf or text with file upload
  if (req.body.contentType === 'pdf') {
    if (!req.file) {
      return res.status(400).json({ error: 'PDFファイルが必要です' });
    }
  } else if (req.body.contentType === 'youtube' || req.body.contentType === 'text') {
    // Skip file validation for YouTube and text content
    return next();
  }

  if (!req.file) {
    return next(); // Allow for non-file uploads
  }

  const file = req.file;
  
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return res.status(400).json({ 
      error: 'File size exceeds 10MB limit' 
    });
  }

  // Check file type for PDF
  if (req.body.contentType === 'pdf' && file.mimetype !== 'application/pdf') {
    return res.status(400).json({ 
      error: 'Only PDF files are allowed for PDF content type' 
    });
  }

  // Check filename for potential security issues
  const fileName = file.originalname;
  const dangerousPatterns = [
    /\.\./g, // Directory traversal
    /[<>:"|?*]/g, // Invalid filename characters
    /^\./g, // Hidden files
    /\.exe$|\.bat$|\.cmd$|\.scr$/i // Executable files
  ];

  const hasDangerousPattern = dangerousPatterns.some(pattern => 
    pattern.test(fileName)
  );

  if (hasDangerousPattern) {
    return res.status(400).json({ 
      error: 'Invalid or potentially dangerous filename' 
    });
  }

  next();
}