/**
 * Image Proxy Routes
 * Secure image processing and proxying endpoints
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { imageProxy } from '../services/image-proxy';
import { securityLogger, SecurityEventType, SecurityLogLevel } from '../utils/securityLogger';
import { authenticateUser } from '../middleware/auth';
import { authorizeAdmin } from '../middleware/authorization';

const router = Router();

// Rate limiting for image proxy requests with enhanced security
const imageProxyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  message: {
    error: 'Rate limit exceeded',
    retryAfter: 900 // seconds instead of text
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Enhanced key generation with IPv6 support
  keyGenerator: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent')?.slice(0, 50) || 'unknown';
    return `${ip}-${userAgent}`;
  },
  handler: (req, res) => {
    securityLogger.log(
      SecurityLogLevel.WARNING,
      SecurityEventType.RATE_LIMIT_EXCEEDED,
      'Image proxy rate limit exceeded',
      {
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent') || undefined,
        endpoint: req.path,
        metadata: {
          rateLimitType: 'image_proxy',
          windowMs: 15 * 60 * 1000,
          maxRequests: 50
        }
      }
    );
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 900
    });
  }
});

// Admin-only rate limiting for cache management
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { error: 'Too many admin requests' }
});

// Input validation schemas
const imageProxySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  width: z.number().int().min(1).max(4096).optional(),
  height: z.number().int().min(1).max(4096).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  format: z.enum(['jpeg', 'png', 'webp']).optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional()
});

/**
 * Image proxy endpoint
 * GET /proxy?url=<image_url>&width=<width>&height=<height>&quality=<quality>&format=<format>&fit=<fit>
 */
router.get('/proxy', imageProxyRateLimit, async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const queryValidation = imageProxySchema.safeParse({
      url: req.query.url,
      width: req.query.width ? parseInt(req.query.width as string) : undefined,
      height: req.query.height ? parseInt(req.query.height as string) : undefined,
      quality: req.query.quality ? parseInt(req.query.quality as string) : undefined,
      format: req.query.format,
      fit: req.query.fit
    });

    if (!queryValidation.success) {
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'Invalid image proxy parameters',
        {
          ipAddress: req.ip || undefined,
          userAgent: req.get('User-Agent') || undefined,
          metadata: {
            validationErrors: queryValidation.error.errors,
            queryParams: req.query
          }
        }
      );

      return res.status(400).json({
        error: 'Invalid parameters',
        details: queryValidation.error.errors
      });
    }

    const { url, width, height, quality, format, fit } = queryValidation.data;

    // Process image through secure proxy
    const result = await imageProxy.processImage(
      url,
      { width, height, quality, format, fit },
      req.ip || req.connection?.remoteAddress
    );

    if (!result.success) {
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'Image proxy processing failed',
        {
          ipAddress: req.ip || undefined,
          userAgent: req.get('User-Agent') || undefined,
          metadata: {
            url: url,
            error: result.error,
            securityRisk: result.securityRisk
          }
        }
      );

      const statusCode = result.securityRisk ? 403 : 500;
      return res.status(statusCode).json({
        error: result.error,
        securityRisk: result.securityRisk
      });
    }

    // Set security headers
    res.set({
      'Content-Type': result.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600', // 1 hour cache
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'",
      'Referrer-Policy': 'no-referrer'
    });

    // Add processing info headers (for debugging in development)
    if (process.env.NODE_ENV === 'development') {
      res.set({
        'X-Original-Size': result.originalSize?.toString() || '0',
        'X-Processed-Size': result.processedSize?.toString() || '0',
        'X-Compression-Ratio': result.originalSize && result.processedSize 
          ? `${((result.originalSize - result.processedSize) / result.originalSize * 100).toFixed(2)}%`
          : '0%'
      });
    }

    res.send(result.buffer);

  } catch (error) {
    securityLogger.log(
      SecurityLogLevel.ERROR,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Image proxy endpoint error',
      {
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent') || undefined,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          url: req.query.url
        }
      }
    );

    res.status(500).json({
      error: 'Internal server error',
      message: 'Image processing failed'
    });
  }
});

/**
 * Cache statistics endpoint (admin only)
 * GET /cache/stats
 */
router.get('/cache/stats', authenticateUser, authorizeAdmin, adminRateLimit, async (req: Request, res: Response) => {
  try {
    const stats = imageProxy.getCacheStats();
    
    securityLogger.log(
      SecurityLogLevel.INFO,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Image proxy cache stats accessed',
      {
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent') || undefined,
        metadata: {
          cacheStats: stats,
          accessedBy: 'admin'
        }
      }
    );

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    securityLogger.log(
      SecurityLogLevel.ERROR,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Cache stats endpoint error',
      {
        ipAddress: req.ip || undefined,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    );

    res.status(500).json({
      error: 'Failed to retrieve cache statistics'
    });
  }
});

/**
 * Cache management endpoint (admin only)
 * POST /cache/clear
 */
router.post('/cache/clear', authenticateUser, authorizeAdmin, adminRateLimit, async (req: Request, res: Response) => {
  try {
    imageProxy.clearCache();

    securityLogger.log(
      SecurityLogLevel.INFO,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Image proxy cache manually cleared',
      {
        ipAddress: req.ip || undefined,
        userAgent: req.get('User-Agent') || undefined,
        metadata: {
          action: 'cache_clear',
          triggeredBy: 'admin_request'
        }
      }
    );

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });

  } catch (error) {
    securityLogger.log(
      SecurityLogLevel.ERROR,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Cache clear endpoint error',
      {
        ipAddress: req.ip || undefined,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    );

    res.status(500).json({
      error: 'Failed to clear cache'
    });
  }
});

/**
 * Health check endpoint
 * GET /health
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'image-proxy',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

export { router as imageProxyRouter };