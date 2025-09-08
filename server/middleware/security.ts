import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
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
 * Rate limiting middleware using express-rate-limit
 * Provides better security against IP spoofing and proxy attacks
 */

// General API rate limit - 100 requests per hour per IP
export const apiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'リクエストが多すぎます。1時間後に再試行してください。',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true, // Trust X-Forwarded-For headers
  keyGenerator: (req) => {
    // Use X-Forwarded-For if available, fallback to connection IP
    const forwarded = req.get('X-Forwarded-For');
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  }
});

// Upload rate limit - 10 uploads per hour per IP
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    error: 'Too many file uploads',
    message: 'ファイルアップロードが多すぎます。1時間後に再試行してください。',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => {
    const forwarded = req.get('X-Forwarded-For');
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  }
});

// Strict rate limit for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts',
    message: '認証試行回数が多すぎます。15分後に再試行してください。',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => {
    const forwarded = req.get('X-Forwarded-For');
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  },
  skipSuccessfulRequests: true // Don't count successful logins against the limit
});

// Registration rate limit - 3 registrations per hour per IP
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    error: 'Too many registration attempts',
    message: 'アカウント作成試行回数が多すぎます。1時間後に再試行してください。',
    code: 'REGISTER_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => {
    const forwarded = req.get('X-Forwarded-For');
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  }
});

// Quiz generation rate limit - 20 quizzes per hour per IP
export const quizRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    error: 'Too many quiz generation requests',
    message: 'クイズ生成リクエストが多すぎます。1時間後に再試行してください。',
    code: 'QUIZ_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  keyGenerator: (req) => {
    const forwarded = req.get('X-Forwarded-For');
    return forwarded ? forwarded.split(',')[0].trim() : req.ip;
  }
});

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