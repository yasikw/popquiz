import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Modern CSRF protection middleware using Double Submit Cookie pattern
 * Suitable for JWT-based authentication systems
 */

// Generate a secure random token
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Validate CSRF token from both cookie and header
function validateCSRFToken(cookieToken: string, headerToken: string): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken, 'hex'),
    Buffer.from(headerToken, 'hex')
  );
}

// CSRF token generation endpoint
export function generateCSRFTokenEndpoint(req: Request, res: Response) {
  const token = generateCSRFToken();
  
  // Set CSRF token as secure, httpOnly cookie
  res.cookie('_csrf', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  });
  
  // Also return token in response for SPA usage
  res.json({ 
    csrfToken: token,
    message: 'CSRF token generated successfully'
  });
}

// CSRF protection middleware
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF protection for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const cookieToken = req.cookies._csrf;
  const headerToken = req.headers['x-csrf-token'] as string || 
                     req.headers['x-xsrf-token'] as string;
  
  if (!validateCSRFToken(cookieToken, headerToken)) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'CSRFトークンが無効です。ページを再読み込みしてください。',
      code: 'INVALID_CSRF_TOKEN'
    });
  }
  
  next();
}

// Public endpoints that should be excluded from CSRF protection
const publicEndpoints = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh-token',
  '/api/csrf-token'
];

// CSRF middleware with exceptions for public endpoints
export function csrfProtectionWithExceptions(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF protection for public endpoints
  if (publicEndpoints.some(endpoint => req.path === endpoint)) {
    return next();
  }
  
  // Skip for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Apply CSRF protection for all other requests
  return csrfProtection(req, res, next);
}

// Refresh CSRF token (useful for long-lived sessions)
export function refreshCSRFToken(req: Request, res: Response) {
  const newToken = generateCSRFToken();
  
  res.cookie('_csrf', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  });
  
  res.json({ 
    csrfToken: newToken,
    message: 'CSRF token refreshed successfully'
  });
}