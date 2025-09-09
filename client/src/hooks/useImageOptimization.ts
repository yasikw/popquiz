/**
 * useImageOptimization Hook
 * Automatic image optimization and performance monitoring
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  enableAutoFormat?: boolean;
  enableResponsive?: boolean;
}

interface ImageOptimizationResult {
  optimizedSrc: string;
  isOptimized: boolean;
  compressionRatio?: number;
  loadTime?: number;
  error?: string;
}

interface ImagePerformanceMetrics {
  totalImages: number;
  optimizedImages: number;
  averageLoadTime: number;
  averageCompressionRatio: number;
  errorRate: number;
}

export const useImageOptimization = (
  src: string,
  options: ImageOptimizationOptions = {}
): ImageOptimizationResult => {
  const [result, setResult] = useState<ImageOptimizationResult>({
    optimizedSrc: src,
    isOptimized: false
  });

  const [performanceMetrics, setPerformanceMetrics] = useState<{
    startTime?: number;
    endTime?: number;
  }>({});

  // Detect optimal format based on browser support
  const getBestFormat = useCallback((): 'webp' | 'jpeg' | 'png' => {
    if (!options.enableAutoFormat) {
      return options.format || 'webp';
    }

    // Check WebP support
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const webpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;

    if (webpSupported) return 'webp';
    
    // Fallback based on original image or preference
    const extension = src.split('.').pop()?.toLowerCase();
    if (extension === 'png') return 'png';
    return 'jpeg';
  }, [src, options.format, options.enableAutoFormat]);

  // Get responsive dimensions based on viewport
  const getResponsiveDimensions = useCallback((): { width?: number; height?: number } => {
    if (!options.enableResponsive) {
      return { width: options.width, height: options.height };
    }

    const screenWidth = window.innerWidth;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Calculate optimal width based on screen size
    let optimalWidth = options.width;
    
    if (!optimalWidth) {
      if (screenWidth <= 480) {
        optimalWidth = 480;
      } else if (screenWidth <= 768) {
        optimalWidth = 768;
      } else if (screenWidth <= 1024) {
        optimalWidth = 1024;
      } else {
        optimalWidth = 1920;
      }
    }

    // Adjust for high DPI displays
    optimalWidth = Math.round(optimalWidth * Math.min(devicePixelRatio, 2));

    return {
      width: optimalWidth,
      height: options.height
    };
  }, [options.width, options.height, options.enableResponsive]);

  // Build optimized URL
  const buildOptimizedUrl = useCallback((originalSrc: string): string => {
    // Skip optimization for internal, data, or blob URLs
    if (
      originalSrc.startsWith('/') ||
      originalSrc.startsWith(window.location.origin) ||
      originalSrc.startsWith('data:') ||
      originalSrc.startsWith('blob:')
    ) {
      return originalSrc;
    }

    const proxyUrl = new URL('/api/image/proxy', window.location.origin);
    proxyUrl.searchParams.set('url', originalSrc);

    const dimensions = getResponsiveDimensions();
    const format = getBestFormat();

    if (dimensions.width) {
      proxyUrl.searchParams.set('width', dimensions.width.toString());
    }
    if (dimensions.height) {
      proxyUrl.searchParams.set('height', dimensions.height.toString());
    }
    if (options.quality && options.quality !== 85) {
      proxyUrl.searchParams.set('quality', options.quality.toString());
    }
    if (format !== 'webp') {
      proxyUrl.searchParams.set('format', format);
    }
    if (options.fit && options.fit !== 'inside') {
      proxyUrl.searchParams.set('fit', options.fit);
    }

    return proxyUrl.toString();
  }, [options, getResponsiveDimensions, getBestFormat]);

  // Monitor image loading performance
  const measurePerformance = useCallback((optimizedSrc: string) => {
    const startTime = performance.now();
    setPerformanceMetrics({ startTime });

    const img = new Image();
    
    img.onload = () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      setPerformanceMetrics({ startTime, endTime });
      
      // Extract compression info from headers if available
      fetch(optimizedSrc, { method: 'HEAD' })
        .then(response => {
          const originalSize = parseInt(response.headers.get('X-Original-Size') || '0');
          const processedSize = parseInt(response.headers.get('X-Processed-Size') || '0');
          const compressionRatio = originalSize && processedSize 
            ? ((originalSize - processedSize) / originalSize) * 100
            : undefined;

          setResult(prev => ({
            ...prev,
            loadTime,
            compressionRatio
          }));

          // Update global performance metrics
          updateGlobalMetrics({
            loadTime,
            compressionRatio,
            success: true
          });
        })
        .catch(() => {
          // Headers not available, just record load time
          setResult(prev => ({
            ...prev,
            loadTime
          }));

          updateGlobalMetrics({
            loadTime,
            success: true
          });
        });
    };

    img.onerror = () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      setResult(prev => ({
        ...prev,
        error: 'Failed to load optimized image',
        loadTime
      }));

      updateGlobalMetrics({
        loadTime,
        success: false
      });
    };

    img.src = optimizedSrc;
  }, []);

  // Update global performance metrics (stored in localStorage)
  const updateGlobalMetrics = useCallback((metrics: {
    loadTime: number;
    compressionRatio?: number;
    success: boolean;
  }) => {
    try {
      const stored = localStorage.getItem('imageOptimizationMetrics');
      const existing: ImagePerformanceMetrics = stored 
        ? JSON.parse(stored)
        : {
            totalImages: 0,
            optimizedImages: 0,
            averageLoadTime: 0,
            averageCompressionRatio: 0,
            errorRate: 0
          };

      const newTotal = existing.totalImages + 1;
      const newOptimized = existing.optimizedImages + (metrics.compressionRatio ? 1 : 0);
      const newAverageLoadTime = 
        (existing.averageLoadTime * existing.totalImages + metrics.loadTime) / newTotal;
      const newAverageCompressionRatio = metrics.compressionRatio
        ? (existing.averageCompressionRatio * existing.optimizedImages + metrics.compressionRatio) / newOptimized
        : existing.averageCompressionRatio;
      const newErrorRate = metrics.success 
        ? (existing.errorRate * existing.totalImages) / newTotal
        : (existing.errorRate * existing.totalImages + 1) / newTotal;

      const updatedMetrics: ImagePerformanceMetrics = {
        totalImages: newTotal,
        optimizedImages: newOptimized,
        averageLoadTime: newAverageLoadTime,
        averageCompressionRatio: newAverageCompressionRatio,
        errorRate: newErrorRate
      };

      localStorage.setItem('imageOptimizationMetrics', JSON.stringify(updatedMetrics));
    } catch (error) {
      console.warn('Failed to update image optimization metrics:', error);
    }
  }, []);

  // Main effect - optimize image URL
  useEffect(() => {
    if (!src) {
      setResult({ optimizedSrc: '', isOptimized: false });
      return;
    }

    const optimizedSrc = buildOptimizedUrl(src);
    const isOptimized = optimizedSrc !== src;

    setResult({
      optimizedSrc,
      isOptimized
    });

    // Measure performance for optimized images
    if (isOptimized) {
      measurePerformance(optimizedSrc);
    }
  }, [src, buildOptimizedUrl, measurePerformance]);

  return result;
};

// Hook to get global performance metrics
export const useImagePerformanceMetrics = (): ImagePerformanceMetrics => {
  const [metrics, setMetrics] = useState<ImagePerformanceMetrics>({
    totalImages: 0,
    optimizedImages: 0,
    averageLoadTime: 0,
    averageCompressionRatio: 0,
    errorRate: 0
  });

  useEffect(() => {
    const loadMetrics = () => {
      try {
        const stored = localStorage.getItem('imageOptimizationMetrics');
        if (stored) {
          setMetrics(JSON.parse(stored));
        }
      } catch (error) {
        console.warn('Failed to load image optimization metrics:', error);
      }
    };

    loadMetrics();

    // Listen for storage changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'imageOptimizationMetrics') {
        loadMetrics();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return metrics;
};

// Utility hook for responsive image sizing
export const useResponsiveImageSize = (maxWidth?: number, maxHeight?: number) => {
  const [dimensions, setDimensions] = useState({ width: maxWidth, height: maxHeight });

  useEffect(() => {
    const updateDimensions = () => {
      const screenWidth = window.innerWidth;
      const devicePixelRatio = window.devicePixelRatio || 1;

      let optimalWidth = maxWidth;
      
      if (!optimalWidth) {
        if (screenWidth <= 480) {
          optimalWidth = Math.min(480, screenWidth);
        } else if (screenWidth <= 768) {
          optimalWidth = Math.min(768, screenWidth);
        } else if (screenWidth <= 1024) {
          optimalWidth = Math.min(1024, screenWidth);
        } else {
          optimalWidth = Math.min(1920, screenWidth);
        }
      }

      // Adjust for high DPI displays (but cap at 2x)
      optimalWidth = Math.round(optimalWidth * Math.min(devicePixelRatio, 2));

      setDimensions({
        width: optimalWidth,
        height: maxHeight
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => window.removeEventListener('resize', updateDimensions);
  }, [maxWidth, maxHeight]);

  return dimensions;
};