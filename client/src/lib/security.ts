import DOMPurify from 'dompurify';

/**
 * Sanitizes user input to prevent XSS attacks
 * @param input - The user input to sanitize
 * @param options - DOMPurify configuration options
 * @returns Sanitized string safe for rendering
 */
export function sanitizeUserInput(
  input: string, 
  options: any = {}
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Default configuration for text content
  const defaultConfig = {
    ALLOWED_TAGS: [], // No HTML tags allowed by default
    ALLOWED_ATTR: [], // No attributes allowed by default
    KEEP_CONTENT: true, // Keep text content, remove only tags
    ...options
  };

  return String(DOMPurify.sanitize(input.trim(), defaultConfig));
}

/**
 * Sanitizes HTML content while allowing safe tags
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Validates and sanitizes URL inputs
 * @param url - URL to validate and sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeURL(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    // Create URL object to validate format
    const urlObj = new URL(url.trim());
    
    // Only allow http, https, and youtube protocols
    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return '';
    }

    // Additional validation for YouTube URLs
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const youtubePatterns = [
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
        /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/
      ];
      
      const isValidYoutube = youtubePatterns.some(pattern => pattern.test(url));
      if (!isValidYoutube) {
        return '';
      }
    }

    return urlObj.toString();
  } catch {
    return '';
  }
}

/**
 * Validates file inputs for security
 * @param file - File object to validate
 * @param allowedTypes - Array of allowed MIME types
 * @param maxSize - Maximum file size in bytes
 * @returns Validation result with error message if any
 */
export function validateFile(
  file: File, 
  allowedTypes: string[] = [], 
  maxSize: number = 10 * 1024 * 1024 // 10MB default
): { isValid: boolean; error?: string } {
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }

  // Check file size
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return { 
      isValid: false, 
      error: `File size exceeds ${maxMB}MB limit` 
    };
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return { 
      isValid: false, 
      error: `File type ${file.type} not allowed` 
    };
  }

  // Check file name for potential security issues
  const fileName = file.name;
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
    return { 
      isValid: false, 
      error: 'Invalid or potentially dangerous filename' 
    };
  }

  return { isValid: true };
}

/**
 * Rate limiting helper for client-side validation
 */
export class ClientRateLimit {
  private attempts: Map<string, number[]> = new Map();
  
  constructor(
    private maxAttempts: number = 5,
    private windowMs: number = 60000 // 1 minute
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Remove old attempts outside the window
    const validAttempts = attempts.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validAttempts.length >= this.maxAttempts) {
      return false;
    }

    // Add current attempt
    validAttempts.push(now);
    this.attempts.set(key, validAttempts);
    
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}