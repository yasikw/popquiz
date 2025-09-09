import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { securityLogger } from '../utils/securityLogger.js';

/**
 * Enhanced CSRF protection middleware using Double Submit Cookie pattern
 * Includes additional security features and monitoring
 */

// Token storage for server-side validation
interface CSRFTokenData {
  token: string;
  createdAt: number;
  ipAddress: string;
}

// In-memory token store for validation (consider Redis for production clusters)
const tokenStore = new Map<string, CSRFTokenData>();
const TOKEN_EXPIRY = 3600000; // 1 hour
const MAX_TOKENS_PER_IP = 10;

// Clean expired tokens periodically
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(tokenStore.entries());
  for (const [key, data] of entries) {
    if (now - data.createdAt > TOKEN_EXPIRY) {
      tokenStore.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

// Generate a secure random token with enhanced entropy
export function generateCSRFToken(ipAddress: string = ''): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(32);
  const entropy = crypto.randomBytes(16);
  
  // Create HMAC with additional entropy
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET || 'default-secret');
  hmac.update(randomBytes);
  hmac.update(timestamp.toString());
  hmac.update(entropy);
  
  const token = hmac.digest('hex');
  
  // Store token with metadata for validation
  tokenStore.set(token, {
    token,
    createdAt: timestamp,
    ipAddress
  });
  
  // Clean up old tokens for this IP to prevent memory exhaustion
  cleanupTokensForIP(ipAddress);
  
  return token;
}

// Clean up old tokens for a specific IP address
function cleanupTokensForIP(ipAddress: string): void {
  const tokensForIP = Array.from(tokenStore.entries())
    .filter(([_, data]) => data.ipAddress === ipAddress)
    .sort((a, b) => b[1].createdAt - a[1].createdAt);
  
  // Keep only the most recent MAX_TOKENS_PER_IP tokens
  if (tokensForIP.length > MAX_TOKENS_PER_IP) {
    const tokensToRemove = tokensForIP.slice(MAX_TOKENS_PER_IP);
    tokensToRemove.forEach(([token]) => tokenStore.delete(token));
  }
}

// Enhanced CSRF token validation with server-side verification
function validateCSRFToken(cookieToken: string, headerToken: string, ipAddress: string = ''): boolean {
  if (!cookieToken || !headerToken) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: Missing tokens',
      undefined,
      ipAddress,
      { hasCookie: !!cookieToken, hasHeader: !!headerToken }
    );
    return false;
  }
  
  // Validate token format (64 hex characters)
  const tokenRegex = /^[a-f0-9]{64}$/;
  if (!tokenRegex.test(cookieToken) || !tokenRegex.test(headerToken)) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: Invalid token format',
      undefined,
      ipAddress
    );
    return false;
  }
  
  // Check if tokens match using timing-safe comparison
  let tokensMatch = false;
  try {
    tokensMatch = crypto.timingSafeEqual(
      Buffer.from(cookieToken, 'hex'),
      Buffer.from(headerToken, 'hex')
    );
  } catch (error) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation error: Buffer comparison failed',
      undefined,
      ipAddress,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
    return false;
  }
  
  if (!tokensMatch) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: Token mismatch',
      undefined,
      ipAddress
    );
    return false;
  }
  
  // Verify token exists in server-side store and is not expired
  const tokenData = tokenStore.get(cookieToken);
  if (!tokenData) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: Token not found in store',
      undefined,
      ipAddress
    );
    return false;
  }
  
  const now = Date.now();
  if (now - tokenData.createdAt > TOKEN_EXPIRY) {
    tokenStore.delete(cookieToken);
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: Token expired',
      undefined,
      ipAddress,
      { tokenAge: now - tokenData.createdAt }
    );
    return false;
  }
  
  // Optional: Verify IP address match (can be disabled for mobile users)
  if (process.env.CSRF_STRICT_IP === 'true' && tokenData.ipAddress !== ipAddress) {
    securityLogger.logSuspiciousActivity(
      'CSRF validation failed: IP address mismatch',
      undefined,
      ipAddress,
      { originalIP: tokenData.ipAddress, currentIP: ipAddress }
    );
    return false;
  }
  
  return true;
}

// Enhanced CSRF token generation endpoint with rate limiting
export function generateCSRFTokenEndpoint(req: Request, res: Response) {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Rate limiting check
  const recentTokensForIP = Array.from(tokenStore.values())
    .filter(data => data.ipAddress === ipAddress && (Date.now() - data.createdAt) < 60000) // Last minute
    .length;
  
  if (recentTokensForIP >= 5) {
    securityLogger.logSuspiciousActivity(
      'CSRF token generation rate limit exceeded',
      undefined,
      ipAddress,
      { recentTokenCount: recentTokensForIP }
    );
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'CSRFトークンの生成回数が制限を超えています。しばらく待ってから再試行してください。',
      code: 'CSRF_RATE_LIMIT'
    });
  }
  
  const token = generateCSRFToken(ipAddress);
  
  // Set CSRF token as secure, httpOnly cookie with enhanced security
  res.cookie('_csrf', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY,
    path: '/', // Explicit path
    ...(process.env.NODE_ENV === 'production' && { domain: process.env.COOKIE_DOMAIN })
  });
  
  // Log CSRF token generation (optional - commented out for performance)
  // securityLogger.log(SecurityLogLevel.INFO, SecurityEventType.CSRF_VIOLATION, 
  //   'CSRF token generated', { ipAddress, userAgent: req.get('User-Agent') });
  
  // Return token in response for SPA usage
  res.json({ 
    csrfToken: token,
    message: 'CSRF token generated successfully',
    expiresIn: TOKEN_EXPIRY
  });
}

// Enhanced CSRF protection middleware with comprehensive logging
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF protection for safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const cookieToken = req.cookies._csrf;
  const headerToken = (req.headers['x-csrf-token'] as string) || 
                     (req.headers['x-xsrf-token'] as string);
  
  if (!validateCSRFToken(cookieToken, headerToken, ipAddress)) {
    securityLogger.logSuspiciousActivity(
      'CSRF attack attempt detected',
      undefined,
      ipAddress,
      {
        userAgent,
        method: req.method,
        url: req.url,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken
      }
    );
    
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'CSRFトークンが無効です。ページを再読み込みしてください。',
      code: 'INVALID_CSRF_TOKEN',
      timestamp: new Date().toISOString()
    });
  }
  
  // Log successful CSRF validation for audit purposes (optional - can be removed for performance)
  // securityLogger.logSecurityEvent('CSRF validation successful', 'info', {
  //   ipAddress, method: req.method, url: req.url
  // });
  
  next();
}

// Public endpoints that should be excluded from CSRF protection
const publicEndpoints = [
  '/api/auth/login',
  '/api/auth/register', 
  '/api/auth/refresh-token',
  '/api/csrf-token',
  '/api/csrf-token/refresh',
  '/api/csp-report', // CSP violation reports
  '/api/health', // Health check endpoints
  '/api/csrf-stats' // CSRF statistics (if implemented)
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

// Enhanced CSRF token refresh with cleanup
export function refreshCSRFToken(req: Request, res: Response) {
  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
  const oldToken = req.cookies._csrf;
  
  // Remove old token from store
  if (oldToken && tokenStore.has(oldToken)) {
    tokenStore.delete(oldToken);
  }
  
  const newToken = generateCSRFToken(ipAddress);
  
  res.cookie('_csrf', newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY,
    path: '/',
    ...(process.env.NODE_ENV === 'production' && { domain: process.env.COOKIE_DOMAIN })
  });
  
  // Log CSRF token refresh (optional - commented out for performance)
  // securityLogger.log(SecurityLogLevel.INFO, SecurityEventType.CSRF_VIOLATION,
  //   'CSRF token refreshed', { ipAddress, userAgent: req.get('User-Agent'), oldTokenPresent: !!oldToken });
  
  res.json({ 
    csrfToken: newToken,
    message: 'CSRF token refreshed successfully',
    expiresIn: TOKEN_EXPIRY,
    timestamp: new Date().toISOString()
  });
}

// Get CSRF protection statistics (for monitoring)
export function getCSRFStats(): {
  activeTokens: number;
  oldestTokenAge: number;
  tokensPerIP: Record<string, number>;
} {
  const now = Date.now();
  const tokensPerIP: Record<string, number> = {};
  let oldestTokenAge = 0;
  
  const entries = Array.from(tokenStore.entries());
  for (const [_, data] of entries) {
    const age = now - data.createdAt;
    if (age > oldestTokenAge) {
      oldestTokenAge = age;
    }
    
    tokensPerIP[data.ipAddress] = (tokensPerIP[data.ipAddress] || 0) + 1;
  }
  
  return {
    activeTokens: tokenStore.size,
    oldestTokenAge,
    tokensPerIP
  };
}