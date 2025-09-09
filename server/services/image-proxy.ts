/**
 * Secure Image Proxy Service
 * Phase 2: Complete image processing and proxying with security controls
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import { validateImageUrl, validateImageContent } from '../middleware/image-validator';
import { getImageSecurityConfig } from '../../config/image-security';
import { securityLogger, SecurityEventType, SecurityLogLevel } from '../utils/securityLogger';

export interface ImageProxyOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface ImageProxyResult {
  success: boolean;
  buffer?: Buffer;
  contentType?: string;
  originalSize?: number;
  processedSize?: number;
  error?: string;
  securityRisk?: string;
}

export interface ImageCacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: Date;
  originalUrl: string;
  processedSize: number;
  accessCount: number;
}

class SecureImageProxy {
  private cache: Map<string, ImageCacheEntry> = new Map();
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB cache limit
  private readonly CACHE_TTL = 3600 * 1000; // 1 hour cache TTL
  private readonly MAX_CACHE_ENTRIES = 1000;
  private currentCacheSize = 0;

  constructor() {
    // Clean up cache periodically
    setInterval(() => this.cleanupCache(), 300000); // Every 5 minutes
  }

  /**
   * Generate cache key from URL and processing options
   */
  private generateCacheKey(url: string, options: ImageProxyOptions): string {
    const optionsStr = Object.entries(options)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${Buffer.from(url).toString('base64')}_${Buffer.from(optionsStr).toString('base64')}`;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > this.CACHE_TTL) {
        this.currentCacheSize -= entry.processedSize;
        this.cache.delete(key);
        cleaned++;
      }
    }

    // Also clean up least accessed entries if cache is too large
    if (this.currentCacheSize > this.MAX_CACHE_SIZE || this.cache.size > this.MAX_CACHE_ENTRIES) {
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.accessCount - b.accessCount);

      const toRemove = Math.max(
        entries.length - this.MAX_CACHE_ENTRIES,
        Math.ceil(entries.length * 0.2) // Remove 20% of entries
      );

      for (let i = 0; i < toRemove && i < entries.length; i++) {
        const [key, entry] = entries[i];
        this.currentCacheSize -= entry.processedSize;
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      securityLogger.log(
        SecurityLogLevel.INFO,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'Image proxy cache cleanup completed',
        {
          metadata: {
            entriesRemoved: cleaned,
            currentCacheSize: this.currentCacheSize,
            totalEntries: this.cache.size
          }
        }
      );
    }
  }

  /**
   * Validate and process image processing options
   */
  private validateOptions(options: ImageProxyOptions): { valid: boolean; error?: string } {
    if (options.width && (options.width < 1 || options.width > 4096)) {
      return { valid: false, error: 'Width must be between 1 and 4096 pixels' };
    }

    if (options.height && (options.height < 1 || options.height > 4096)) {
      return { valid: false, error: 'Height must be between 1 and 4096 pixels' };
    }

    if (options.quality && (options.quality < 1 || options.quality > 100)) {
      return { valid: false, error: 'Quality must be between 1 and 100' };
    }

    const allowedFormats = ['jpeg', 'png', 'webp'];
    if (options.format && !allowedFormats.includes(options.format)) {
      return { valid: false, error: `Format must be one of: ${allowedFormats.join(', ')}` };
    }

    const allowedFits = ['cover', 'contain', 'fill', 'inside', 'outside'];
    if (options.fit && !allowedFits.includes(options.fit)) {
      return { valid: false, error: `Fit must be one of: ${allowedFits.join(', ')}` };
    }

    return { valid: true };
  }

  /**
   * Process image with Sharp
   */
  private async processImage(buffer: Buffer, options: ImageProxyOptions, originalContentType: string): Promise<Buffer> {
    let sharpInstance = sharp(buffer);

    // Resize image if dimensions specified
    if (options.width || options.height) {
      sharpInstance = sharpInstance.resize(
        options.width,
        options.height,
        {
          fit: options.fit || 'inside',
          withoutEnlargement: true // Prevent upscaling
        }
      );
    }

    // Apply format and quality settings
    if (options.format) {
      switch (options.format) {
        case 'jpeg':
          sharpInstance = sharpInstance.jpeg({ 
            quality: options.quality || 85,
            progressive: true 
          });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ 
            compressionLevel: 9,
            adaptiveFiltering: true 
          });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ 
            quality: options.quality || 85,
            effort: 6 
          });
          break;
      }
    } else if (options.quality && originalContentType.includes('jpeg')) {
      sharpInstance = sharpInstance.jpeg({ quality: options.quality });
    }

    // Strip metadata for privacy and size reduction
    sharpInstance = sharpInstance.rotate(); // Auto-rotate based on EXIF
    
    return await sharpInstance.toBuffer();
  }

  /**
   * Fetch and process image through secure proxy
   */
  async processImage(url: string, options: ImageProxyOptions = {}, clientIP?: string): Promise<ImageProxyResult> {
    const config = getImageSecurityConfig();
    const cacheKey = this.generateCacheKey(url, options);

    try {
      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp.getTime() < this.CACHE_TTL) {
        cached.accessCount++;
        
        securityLogger.log(
          SecurityLogLevel.INFO,
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          'Image served from cache',
          {
            ipAddress: clientIP,
            metadata: {
              url: url,
              cacheHit: true,
              size: cached.processedSize,
              accessCount: cached.accessCount
            }
          }
        );

        return {
          success: true,
          buffer: cached.buffer,
          contentType: cached.contentType,
          processedSize: cached.processedSize
        };
      }

      // Validate processing options
      const optionsValidation = this.validateOptions(options);
      if (!optionsValidation.valid) {
        return {
          success: false,
          error: optionsValidation.error,
          securityRisk: 'INVALID_PROCESSING_OPTIONS'
        };
      }

      // Validate URL security
      const urlValidation = await validateImageUrl(url);
      if (!urlValidation.valid) {
        securityLogger.log(
          SecurityLogLevel.WARNING,
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          'Image proxy URL validation failed',
          {
            ipAddress: clientIP,
            metadata: {
              url: url,
              validationError: urlValidation.error,
              securityRisk: urlValidation.securityRisk
            }
          }
        );

        return {
          success: false,
          error: urlValidation.error,
          securityRisk: urlValidation.securityRisk
        };
      }

      // Validate image content accessibility
      const contentValidation = await validateImageContent(url);
      if (!contentValidation.valid) {
        return {
          success: false,
          error: contentValidation.error,
          securityRisk: contentValidation.securityRisk
        };
      }

      // Fetch image with security controls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'AI-Quiz-ImageProxy/1.0',
          'Accept': 'image/*',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type
      const contentType = response.headers.get('content-type') || '';
      if (!config.allowedMimeTypes.includes(contentType)) {
        securityLogger.log(
          SecurityLogLevel.WARNING,
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          'Invalid image content type in proxy request',
          {
            ipAddress: clientIP,
            metadata: {
              url: url,
              contentType: contentType,
              allowedTypes: config.allowedMimeTypes
            }
          }
        );

        return {
          success: false,
          error: `Content type ${contentType} not allowed`,
          securityRisk: 'INVALID_CONTENT_TYPE'
        };
      }

      // Get image buffer
      const originalBuffer = Buffer.from(await response.arrayBuffer());
      const originalSize = originalBuffer.length;

      // Validate file size
      if (originalSize > config.maxFileSize) {
        return {
          success: false,
          error: `Image too large: ${originalSize} bytes (max: ${config.maxFileSize})`,
          securityRisk: 'OVERSIZED_RESOURCE'
        };
      }

      // Process image
      const processedBuffer = await this.processImage(originalBuffer, options, contentType);
      const processedSize = processedBuffer.length;

      // Determine final content type
      let finalContentType = contentType;
      if (options.format) {
        finalContentType = `image/${options.format}`;
      }

      // Cache processed image
      if (this.currentCacheSize + processedSize < this.MAX_CACHE_SIZE) {
        this.cache.set(cacheKey, {
          buffer: processedBuffer,
          contentType: finalContentType,
          timestamp: new Date(),
          originalUrl: url,
          processedSize: processedSize,
          accessCount: 1
        });
        this.currentCacheSize += processedSize;
      }

      // Log successful processing
      securityLogger.log(
        SecurityLogLevel.INFO,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'Image successfully processed through proxy',
        {
          ipAddress: clientIP,
          metadata: {
            url: url,
            originalSize: originalSize,
            processedSize: processedSize,
            compressionRatio: ((originalSize - processedSize) / originalSize * 100).toFixed(2) + '%',
            processingOptions: options,
            cached: true
          }
        }
      );

      return {
        success: true,
        buffer: processedBuffer,
        contentType: finalContentType,
        originalSize: originalSize,
        processedSize: processedSize
      };

    } catch (error) {
      securityLogger.log(
        SecurityLogLevel.ERROR,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        'Image proxy processing error',
        {
          ipAddress: clientIP,
          metadata: {
            url: url,
            error: error instanceof Error ? error.message : 'Unknown error',
            options: options
          }
        }
      );

      return {
        success: false,
        error: `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        securityRisk: 'PROCESSING_ERROR'
      };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      totalEntries: this.cache.size,
      totalSize: this.currentCacheSize,
      maxSize: this.MAX_CACHE_SIZE,
      maxEntries: this.MAX_CACHE_ENTRIES,
      utilizationPercent: (this.currentCacheSize / this.MAX_CACHE_SIZE * 100).toFixed(2) + '%'
    };
  }

  /**
   * Clear cache (for maintenance)
   */
  clearCache(): void {
    this.cache.clear();
    this.currentCacheSize = 0;
    
    securityLogger.log(
      SecurityLogLevel.INFO,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Image proxy cache manually cleared',
      { metadata: { action: 'cache_clear' } }
    );
  }
}

// Export singleton instance
export const imageProxy = new SecureImageProxy();