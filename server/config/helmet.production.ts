/**
 * Production Helmet Configuration
 * 
 * Enhanced security headers configuration for production environments.
 * This provides stricter CSP and additional security measures.
 */

import { HelmetOptions } from 'helmet';
import { getCSPImageSources } from '../../config/image-security';

export const productionHelmetConfig: HelmetOptions = {
  // Content Security Policy - Very strict for production
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      
      // Scripts - Only allow self and specific trusted sources
      scriptSrc: [
        "'self'",
        // Google Analytics (if needed)
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com",
        // Remove unsafe-inline and unsafe-eval in production
      ],
      
      // Styles - Only allow self and specific font providers
      styleSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        // Allow inline styles for critical CSS only
        "'sha256-your-critical-css-hash-here'"
      ],
      
      // Images - Restrict to whitelisted sources only
      imgSrc: getCSPImageSources(),
      
      // API connections - Restrict to necessary endpoints
      connectSrc: [
        "'self'",
        "https://generativelanguage.googleapis.com", // Gemini API
        "https://api.yourdomain.com" // Your API endpoints only
      ],
      
      // Fonts - Only trusted font providers
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com"
      ],
      
      // No objects, embeds, or plugins
      objectSrc: ["'none'"],
      embedSrc: ["'none'"],
      
      // Media restricted to self
      mediaSrc: ["'self'"],
      
      // No frames allowed
      frameSrc: ["'none'"],
      
      // Prevent framing entirely
      frameAncestors: ["'none'"],
      
      // Only allow self for forms
      formAction: ["'self'"],
      
      // Base URI restricted
      baseUri: ["'self'"],
      
      // Upgrade insecure requests
      upgradeInsecureRequests: [],
      
      // Block all mixed content
      blockAllMixedContent: [],
      
      // CSP violation reporting
      reportTo: 'csp-violation-report'
    }
    
    // Note: CSP violation reporting should be configured separately
    // through the Report-To header and Reporting API
  },
  
  // Cross Origin Embedder Policy - Require CORP for embedded resources
  crossOriginEmbedderPolicy: {
    policy: "require-corp"
  },
  
  // Cross Origin Opener Policy - Prevent cross-origin access
  crossOriginOpenerPolicy: {
    policy: "same-origin"
  },
  
  // Cross Origin Resource Policy - Same origin only
  crossOriginResourcePolicy: {
    policy: "same-origin"
  },
  
  // DNS Prefetch Control - Disable to prevent data leakage
  dnsPrefetchControl: {
    allow: false
  },
  
  // Note: Expect-CT header is deprecated in favor of Certificate Transparency logs
  
  // Frameguard - Deny all framing
  frameguard: {
    action: 'deny'
  },
  
  // Hide Powered By header
  hidePoweredBy: true,
  
  // HTTP Strict Transport Security - Very strict
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // IE No Open - Prevent IE from executing downloads
  ieNoOpen: true,
  
  // No Sniff - Prevent MIME type sniffing
  noSniff: true,
  
  // Origin Agent Cluster - Isolate origin
  originAgentCluster: true,
  
  // Note: Permissions Policy should be set via custom middleware
  // as it's not included in the current Helmet types
  
  // Referrer Policy - Strict
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  
  // X-XSS-Protection - Enable with blocking
  xssFilter: true
};

/**
 * Development Helmet Configuration
 * More relaxed settings for development work
 */
export const developmentHelmetConfig: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // Required for Vite in development
        "'unsafe-eval'", // Required for Vite in development
        "https://www.googletagmanager.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // Required for Tailwind CSS
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],
      imgSrc: getCSPImageSources(), // Use domain whitelist even in development
      connectSrc: [
        "'self'",
        "wss://localhost:*", // WebSocket for Vite HMR
        "https://generativelanguage.googleapis.com" // Gemini API
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disabled for external content compatibility
};

/**
 * Get appropriate Helmet configuration based on environment
 */
export function getHelmetConfig(): HelmetOptions {
  return process.env.NODE_ENV === 'production' 
    ? productionHelmetConfig 
    : developmentHelmetConfig;
}