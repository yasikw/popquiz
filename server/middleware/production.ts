/**
 * Production Security Middleware
 * 
 * This module contains middleware specifically designed for production environments,
 * including HTTPS enforcement, HSTS headers, and production-specific security configurations.
 */

import { Request, Response, NextFunction } from 'express';
import { loadProductionConfig } from '../../config/production';

/**
 * Enforce HTTPS in production
 * Redirects all HTTP requests to HTTPS
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    const config = loadProductionConfig();
    
    if (config.security.forceHttps) {
      // Check if request is already HTTPS
      const isHttps = req.secure || 
                     req.get('X-Forwarded-Proto') === 'https' ||
                     req.get('X-Forwarded-Ssl') === 'on' ||
                     (req.connection as any).encrypted;
      
      if (!isHttps) {
        const httpsUrl = `https://${req.get('Host')}${req.url}`;
        return res.redirect(301, httpsUrl);
      }
    }
  }
  
  next();
}

/**
 * Set HTTP Strict Transport Security (HSTS) headers
 */
export function setHstsHeaders(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    const config = loadProductionConfig();
    
    if (config.ssl.enabled) {
      const { maxAge, includeSubDomains, preload } = config.ssl.hsts;
      
      let hstsValue = `max-age=${maxAge}`;
      if (includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (preload) {
        hstsValue += '; preload';
      }
      
      res.setHeader('Strict-Transport-Security', hstsValue);
    }
  }
  
  next();
}

/**
 * Production-specific security headers
 */
export function setProductionSecurityHeaders(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    // Enhanced Content Security Policy for production
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' https://www.googletagmanager.com; " +
      "style-src 'self' https://fonts.googleapis.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://generativelanguage.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'self'; " +
      "frame-ancestors 'none';"
    );
    
    // Additional production security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Remove server information
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
  }
  
  next();
}

/**
 * Production error handling - sanitize error responses
 */
export function productionErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    // Log full error details for debugging (internal use)
    console.error('Production Error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Send sanitized error response to client
    const status = err.status || err.statusCode || 500;
    
    const sanitizedResponse = {
      error: 'Internal Server Error',
      message: status >= 500 
        ? 'サーバーでエラーが発生しました。後ほど再試行してください。'
        : err.message || 'リクエストを処理できませんでした。',
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    };
    
    // Don't expose sensitive information in production
    if (status >= 500) {
      delete sanitizedResponse.message;
      sanitizedResponse.message = 'サーバーでエラーが発生しました。後ほど再試行してください。';
    }
    
    res.status(status).json(sanitizedResponse);
  } else {
    // In non-production, pass through to default error handler
    next(err);
  }
}

/**
 * Security logging for production
 */
export function securityLogging(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    // Log security-relevant requests
    const securityEvents = [
      '/api/auth',
      '/api/login', 
      '/api/register',
      '/api/admin',
      '/api/users'
    ];
    
    const isSecurityEvent = securityEvents.some(path => req.path.startsWith(path));
    
    if (isSecurityEvent) {
      console.log('Security Event:', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        referer: req.get('Referer'),
        origin: req.get('Origin')
      });
    }
  }
  
  next();
}

/**
 * Rate limiting override for production
 */
export function productionRateLimitConfig() {
  if (process.env.NODE_ENV === 'production') {
    const config = loadProductionConfig();
    
    return {
      api: {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: config.security.rateLimiting.api,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: 'Rate limit exceeded',
          message: 'リクエストが多すぎます。時間をおいて再試行してください。',
          code: 'RATE_LIMIT_EXCEEDED'
        }
      },
      upload: {
        windowMs: 60 * 60 * 1000,
        max: config.security.rateLimiting.upload,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          error: 'Upload rate limit exceeded',
          message: 'ファイルアップロードが多すぎます。時間をおいて再試行してください。',
          code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
        }
      },
      auth: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: config.security.rateLimiting.auth,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: {
          error: 'Authentication rate limit exceeded',
          message: '認証試行回数が多すぎます。15分後に再試行してください。',
          code: 'AUTH_RATE_LIMIT_EXCEEDED'
        }
      }
    };
  }
  
  return null;
}

/**
 * Disable debug features in production
 */
export function disableDebugFeatures(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    // Remove debug headers
    res.removeHeader('X-Debug-Token');
    res.removeHeader('X-Debug-Token-Link');
    res.removeHeader('X-Symfony-Profiler-Token');
    
    // Disable source maps
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Block common debug endpoints
    const debugPaths = [
      '/.env',
      '/debug',
      '/phpinfo',
      '/info.php',
      '/server-status',
      '/server-info',
      '/.git',
      '/admin',
      '/phpmyadmin'
    ];
    
    if (debugPaths.some(path => req.path.startsWith(path))) {
      res.status(404).json({
        error: 'Not Found',
        message: 'リクエストされたリソースが見つかりません。'
      });
      return;
    }
  }
  
  next();
}

/**
 * Secure cookie configuration for production
 */
export function getProductionCookieConfig() {
  if (process.env.NODE_ENV === 'production') {
    return {
      secure: true,        // HTTPS only
      httpOnly: true,      // No JavaScript access
      sameSite: 'strict' as const,  // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,  // 24 hours
      domain: process.env.COOKIE_DOMAIN, // Set domain if needed
      path: '/'
    };
  }
  
  return {
    secure: false,
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000
  };
}