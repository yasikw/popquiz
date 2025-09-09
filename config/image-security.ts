/**
 * Image Security Configuration
 * Phase 1: Domain Whitelist Implementation
 */

export interface ImageSecurityConfig {
  allowedDomains: string[];
  allowedProtocols: string[];
  maxFileSize: number;
  allowedMimeTypes: string[];
  timeout: number;
  enableStrictMode: boolean;
}

export const imageSecurityConfig: ImageSecurityConfig = {
  allowedDomains: [
    'localhost',
    // Production domains (update with actual domains)
    process.env.REPLIT_DOMAINS?.split(',')[0] || 'your-domain.com',
    // Trusted CDNs for static assets only
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    // Add other trusted domains as needed
    // 'images.unsplash.com', // Example: only if needed for quiz content
  ],
  
  allowedProtocols: ['https:'], // HTTP excluded for security
  
  maxFileSize: 5 * 1024 * 1024, // 5MB limit
  
  allowedMimeTypes: [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  
  timeout: 10000, // 10 seconds
  
  enableStrictMode: process.env.NODE_ENV === 'production'
};

/**
 * Development vs Production configuration
 */
export const getImageSecurityConfig = (): ImageSecurityConfig => {
  if (process.env.NODE_ENV === 'development') {
    return {
      ...imageSecurityConfig,
      allowedDomains: [
        ...imageSecurityConfig.allowedDomains,
        '127.0.0.1',
        'localhost'
      ],
      enableStrictMode: false
    };
  }
  
  return imageSecurityConfig;
};

/**
 * CSP-compatible domain list for img-src directive
 */
export const getCSPImageSources = (): string[] => {
  const config = getImageSecurityConfig();
  return [
    "'self'",
    "data:",
    ...config.allowedDomains.map(domain => `https://${domain}`)
  ];
};