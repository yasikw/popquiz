/**
 * Image URL Validation Middleware
 * SSRF Protection and Domain Whitelist Enforcement
 */

import { Request, Response, NextFunction } from 'express';
import { URL } from 'url';
import fetch from 'node-fetch';
import { getImageSecurityConfig } from '../../config/image-security';
import { securityLogger, SecurityEventType, SecurityLogLevel } from '../utils/securityLogger';

export interface ImageValidationResult {
  valid: boolean;
  url?: URL;
  error?: string;
  securityRisk?: string;
}

/**
 * Validate image URL against security policies
 */
export async function validateImageUrl(imageUrl: string): Promise<ImageValidationResult> {
  const config = getImageSecurityConfig();
  
  try {
    const url = new URL(imageUrl);
    
    // Protocol validation
    if (!config.allowedProtocols.includes(url.protocol)) {
      const error = `Protocol ${url.protocol} not allowed. Only HTTPS permitted.`;
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SECURITY_VIOLATION,
        'Invalid image protocol attempted',
        { url: imageUrl, protocol: url.protocol }
      );
      return { valid: false, error, securityRisk: 'INVALID_PROTOCOL' };
    }
    
    // Domain whitelist validation
    const isAllowedDomain = config.allowedDomains.some(domain => {
      return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
    });
    
    if (!isAllowedDomain) {
      const error = `Domain ${url.hostname} not in whitelist`;
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SECURITY_VIOLATION,
        'Unauthorized domain access attempted',
        { url: imageUrl, hostname: url.hostname, allowedDomains: config.allowedDomains }
      );
      return { valid: false, error, securityRisk: 'UNAUTHORIZED_DOMAIN' };
    }
    
    // Private IP / SSRF protection
    if (isPrivateIP(url.hostname)) {
      const error = 'Private IP addresses and internal networks not allowed';
      securityLogger.log(
        SecurityLogLevel.ERROR,
        SecurityEventType.SECURITY_VIOLATION,
        'SSRF attempt detected - private IP access',
        { url: imageUrl, hostname: url.hostname, type: 'PRIVATE_IP_ACCESS' }
      );
      return { valid: false, error, securityRisk: 'SSRF_PRIVATE_IP' };
    }
    
    // Localhost / loopback protection (production only)
    if (config.enableStrictMode && isLoopbackAddress(url.hostname)) {
      const error = 'Loopback addresses not allowed in production';
      securityLogger.log(
        SecurityLogLevel.ERROR,
        SecurityEventType.SECURITY_VIOLATION,
        'SSRF attempt detected - loopback access',
        { url: imageUrl, hostname: url.hostname, type: 'LOOPBACK_ACCESS' }
      );
      return { valid: false, error, securityRisk: 'SSRF_LOOPBACK' };
    }
    
    // Port validation (block non-standard ports)
    if (url.port && !isAllowedPort(url.port)) {
      const error = `Port ${url.port} not allowed`;
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SECURITY_VIOLATION,
        'Suspicious port access attempted',
        { url: imageUrl, port: url.port }
      );
      return { valid: false, error, securityRisk: 'SUSPICIOUS_PORT' };
    }
    
    return { valid: true, url };
    
  } catch (parseError) {
    const error = `Invalid URL format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`;
    securityLogger.log(
      SecurityLogLevel.WARNING,
      SecurityEventType.SECURITY_VIOLATION,
      'Malformed URL attempted',
      { url: imageUrl, error: error }
    );
    return { valid: false, error, securityRisk: 'MALFORMED_URL' };
  }
}

/**
 * Check if hostname is a private IP address (RFC 1918)
 */
function isPrivateIP(hostname: string): boolean {
  const privateIPRanges = [
    /^10\./,                                    // 10.0.0.0/8
    /^192\.168\./,                             // 192.168.0.0/16  
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,        // 172.16.0.0/12
    /^127\./,                                  // 127.0.0.0/8 (loopback)
    /^169\.254\./,                            // 169.254.0.0/16 (link-local)
    /^0\./,                                   // 0.0.0.0/8
    /^224\./,                                 // 224.0.0.0/4 (multicast)
    /^240\./                                  // 240.0.0.0/4 (reserved)
  ];
  
  return privateIPRanges.some(pattern => pattern.test(hostname));
}

/**
 * Check if hostname is a loopback address
 */
function isLoopbackAddress(hostname: string): boolean {
  const loopbackPatterns = [
    /^localhost$/i,
    /^127\./,
    /^::1$/,
    /^0:0:0:0:0:0:0:1$/
  ];
  
  return loopbackPatterns.some(pattern => pattern.test(hostname));
}

/**
 * Check if port is allowed (only standard web ports)
 */
function isAllowedPort(port: string): boolean {
  const allowedPorts = ['80', '443', '8080', '8443'];
  return allowedPorts.includes(port);
}

/**
 * Validate image content and size
 */
export async function validateImageContent(imageUrl: string): Promise<ImageValidationResult> {
  const config = getImageSecurityConfig();
  
  try {
    const response = await fetch(imageUrl, {
      method: 'HEAD', // Only get headers, not content
      timeout: config.timeout,
      headers: {
        'User-Agent': 'AI-Quiz-Security-Validator/1.0'
      }
    });
    
    if (!response.ok) {
      return { 
        valid: false, 
        error: `Image not accessible: ${response.status} ${response.statusText}`,
        securityRisk: 'INACCESSIBLE_RESOURCE'
      };
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !config.allowedMimeTypes.includes(contentType)) {
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.SECURITY_VIOLATION,
        'Invalid image content type',
        { url: imageUrl, contentType, allowedTypes: config.allowedMimeTypes }
      );
      return { 
        valid: false, 
        error: `Invalid content type: ${contentType}`,
        securityRisk: 'INVALID_CONTENT_TYPE'
      };
    }
    
    // Check file size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > config.maxFileSize) {
      return { 
        valid: false, 
        error: `Image too large: ${contentLength} bytes (max: ${config.maxFileSize})`,
        securityRisk: 'OVERSIZED_RESOURCE'
      };
    }
    
    return { valid: true };
    
  } catch (fetchError) {
    securityLogger.log(
      SecurityLogLevel.ERROR,
      SecurityEventType.SECURITY_VIOLATION,
      'Image validation network error',
      { url: imageUrl, error: fetchError instanceof Error ? fetchError.message : 'Unknown error' }
    );
    return { 
      valid: false, 
      error: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
      securityRisk: 'NETWORK_ERROR'
    };
  }
}

/**
 * Express middleware for image URL validation
 */
export function imageUrlValidationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip validation for non-image requests
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }
  
  // Check for image URLs in request body
  const imageUrls: string[] = [];
  
  // Recursively find image URLs
  function findImageUrls(obj: any, path = ''): void {
    if (typeof obj === 'string' && (
      obj.startsWith('http') && 
      /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(obj)
    )) {
      imageUrls.push(obj);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        findImageUrls(value, path ? `${path}.${key}` : key);
      }
    }
  }
  
  findImageUrls(req.body);
  
  // If no image URLs found, proceed
  if (imageUrls.length === 0) {
    return next();
  }
  
  // Validate all found image URLs
  Promise.all(imageUrls.map(validateImageUrl))
    .then(results => {
      const invalidResults = results.filter(result => !result.valid);
      
      if (invalidResults.length > 0) {
        securityLogger.log(
          SecurityLogLevel.WARNING,
          SecurityEventType.SECURITY_VIOLATION,
          'Image validation failed in request',
          { 
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            invalidUrls: invalidResults.map(r => ({ error: r.error, risk: r.securityRisk }))
          }
        );
        
        return res.status(400).json({
          error: 'Image validation failed',
          details: invalidResults.map(r => ({
            error: r.error,
            securityRisk: r.securityRisk
          }))
        });
      }
      
      // All validations passed
      next();
    })
    .catch(error => {
      securityLogger.log(
        SecurityLogLevel.ERROR,
        SecurityEventType.SECURITY_VIOLATION,
        'Image validation middleware error',
        { error: error.message, ip: req.ip }
      );
      
      res.status(500).json({
        error: 'Image validation failed',
        message: 'Internal validation error'
      });
    });
}