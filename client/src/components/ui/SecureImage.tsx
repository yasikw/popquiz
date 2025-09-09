/**
 * SecureImage Component
 * Secure image loading with automatic proxy routing and optimization
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SecureImageProps {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  className?: string;
  style?: React.CSSProperties;
  fallbackSrc?: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
  loading?: 'lazy' | 'eager';
  priority?: boolean;
}

const SecureImage: React.FC<SecureImageProps> = ({
  src,
  alt,
  width,
  height,
  quality = 85,
  format = 'webp',
  fit = 'inside',
  className,
  style,
  fallbackSrc,
  onLoad,
  onError,
  loading = 'lazy',
  priority = false,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const maxRetries = 2;

  const buildProxyUrl = useCallback((originalSrc: string): string => {
    // Internal URLs and data URLs are used directly
    if (
      originalSrc.startsWith('/') || 
      originalSrc.startsWith(window.location.origin) ||
      originalSrc.startsWith('data:') ||
      originalSrc.startsWith('blob:')
    ) {
      return originalSrc;
    }

    // External URLs go through secure proxy
    const proxyUrl = new URL('/api/image/proxy', window.location.origin);
    proxyUrl.searchParams.set('url', originalSrc);

    // Add optimization parameters
    if (width && typeof width === 'number') {
      proxyUrl.searchParams.set('width', width.toString());
    }
    if (height && typeof height === 'number') {
      proxyUrl.searchParams.set('height', height.toString());
    }
    if (quality && quality !== 85) {
      proxyUrl.searchParams.set('quality', quality.toString());
    }
    if (format !== 'webp') {
      proxyUrl.searchParams.set('format', format);
    }
    if (fit !== 'inside') {
      proxyUrl.searchParams.set('fit', fit);
    }

    return proxyUrl.toString();
  }, [width, height, quality, format, fit]);

  const handleImageLoad = useCallback(() => {
    setImageLoading(false);
    setError(null);
    onLoad?.();
  }, [onLoad]);

  const handleImageError = useCallback(() => {
    setImageLoading(false);
    
    // Try fallback image first
    if (fallbackSrc && imageSrc !== fallbackSrc && retryCount === 0) {
      setImageSrc(buildProxyUrl(fallbackSrc));
      setRetryCount(1);
      return;
    }

    // Retry with original URL (in case proxy failed)
    if (retryCount < maxRetries) {
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
        setImageSrc(buildProxyUrl(src));
        setImageLoading(true);
      }, 1000 * Math.pow(2, retryCount)); // Exponential backoff
      return;
    }

    // All retries failed
    const errorMessage = 'Failed to load image after multiple attempts';
    setError(errorMessage);
    onError?.(errorMessage);
  }, [fallbackSrc, imageSrc, retryCount, buildProxyUrl, src, onError]);

  useEffect(() => {
    if (!src) {
      setError('No image source provided');
      setImageLoading(false);
      return;
    }

    setImageLoading(true);
    setError(null);
    setRetryCount(0);
    
    const optimizedSrc = buildProxyUrl(src);
    setImageSrc(optimizedSrc);
  }, [src, buildProxyUrl]);

  // Loading state
  if (imageLoading && !error) {
    return (
      <div 
        className={cn(
          "animate-pulse bg-gradient-to-r from-gray-200 to-gray-300 rounded flex items-center justify-center",
          className
        )}
        style={{ 
          width: width || '100%', 
          height: height || 'auto',
          minHeight: '60px',
          ...style 
        }}
        data-testid="secure-image-loading"
      >
        <div className="text-gray-400 text-sm">
          <svg 
            className="w-6 h-6 animate-spin" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div 
        className={cn(
          "bg-red-50 border-2 border-red-200 rounded flex flex-col items-center justify-center p-4",
          className
        )}
        style={{ 
          width: width || '100%', 
          height: height || 'auto',
          minHeight: '80px',
          ...style 
        }}
        data-testid="secure-image-error"
      >
        <div className="text-red-400 mb-2">
          <svg 
            className="w-8 h-8" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z" 
            />
          </svg>
        </div>
        <div className="text-red-600 text-sm text-center">
          <div className="font-medium">画像の読み込みに失敗しました</div>
          {retryCount > 0 && (
            <div className="text-xs mt-1 opacity-75">
              {retryCount}/{maxRetries} 回試行済み
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setError(null);
            setRetryCount(0);
            setImageLoading(true);
            setImageSrc(buildProxyUrl(src));
          }}
          className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded transition-colors"
          data-testid="retry-image-load"
        >
          再試行
        </button>
      </div>
    );
  }

  // Success state - render image
  return (
    <img
      src={imageSrc}
      alt={alt}
      width={width}
      height={height}
      className={cn("transition-opacity duration-300", className)}
      style={style}
      onLoad={handleImageLoad}
      onError={handleImageError}
      loading={priority ? 'eager' : loading}
      data-testid="secure-image"
      {...props}
    />
  );
};

export default SecureImage;