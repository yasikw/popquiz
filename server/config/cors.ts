/**
 * CORS Configuration for DocuQuery
 * Environment-specific origin allowlists and security settings
 */

import { CorsOptions } from 'cors';

/**
 * Environment-specific allowed origins
 */
const getAllowedOrigins = (): string[] => {
  const nodeEnv = process.env.NODE_ENV;
  
  if (nodeEnv === 'production') {
    // 本番環境: 指定ドメインのみ許可
    const productionOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // デフォルトの本番ドメインを追加（必要に応じて調整）
    const defaultProductionOrigins = [
      'https://your-production-domain.com',
      'https://api.your-production-domain.com'
    ];
    
    return [...productionOrigins, ...defaultProductionOrigins].filter(Boolean);
  } else {
    // 開発環境: ALLOWED_ORIGINS環境変数があればそれを使用、なければデフォルト
    const customOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [];
    
    const defaultDevelopmentOrigins = [
      'http://localhost:3000',
      'http://localhost:5000',
      'http://localhost:5173', // Vite default port
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:5173',
      'https://localhost:3000',
      'https://localhost:5000',
      'https://localhost:5173',
      // Replit domains
      `https://${process.env.REPL_SLUG}--${process.env.REPL_OWNER}.repl.co`,
      ...(process.env.REPLIT_DOMAINS?.split(',') || []).map(domain => `https://${domain}`)
    ];
    
    // カスタムオリジンがある場合はそれを優先、デフォルトも追加
    return [...customOrigins, ...defaultDevelopmentOrigins].filter(Boolean);
  }
};

/**
 * CORS origin validation function
 */
const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  const allowedOrigins = getAllowedOrigins();
  
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) {
    return callback(null, true);
  }
  
  // Check if origin is in allowed list
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  
  // Log unauthorized access attempt
  console.warn(`🚨 CORS violation attempt from unauthorized origin: ${origin}`);
  console.warn(`📋 Allowed origins: ${allowedOrigins.join(', ')}`);
  
  // Reject with clear error message
  const error = new Error(
    `CORS Error: Origin '${origin}' is not allowed. ` +
    `Please contact administrator to whitelist this domain.`
  );
  callback(error, false);
};

/**
 * Production-ready CORS configuration
 */
export const corsConfig: CorsOptions = {
  // Dynamic origin validation
  origin: corsOrigin,
  
  // Enable credentials (cookies, authorization headers)
  credentials: true,
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  // Allowed headers
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token',
    'X-Forwarded-For',
    'X-Real-IP',
    'User-Agent',
    'Cache-Control'
  ],
  
  // Headers exposed to the client
  exposedHeaders: [
    'X-Total-Count',
    'X-Rate-Limit-Limit',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset'
  ],
  
  // Preflight request cache time (seconds)
  maxAge: process.env.NODE_ENV === 'production' ? 86400 : 300, // 24h in prod, 5min in dev
  
  // Handle preflight OPTIONS requests
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/**
 * Strict CORS configuration for high-security endpoints
 */
export const strictCorsConfig: CorsOptions = {
  ...corsConfig,
  // Only specific origins for sensitive operations
  origin: (origin, callback) => {
    const strictOrigins = process.env.NODE_ENV === 'production' 
      ? getAllowedOrigins().filter(o => o.includes('your-production-domain.com'))
      : getAllowedOrigins().filter(o => o.includes('localhost') || o.includes('127.0.0.1'));
    
    if (!origin || strictOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`🔒 Strict CORS violation from: ${origin}`);
      callback(new Error(`Strict CORS: Access denied for origin '${origin}'`), false);
    }
  },
  // More restricted methods for sensitive endpoints
  methods: ['GET', 'POST'],
  maxAge: 300 // 5 minutes only
};

/**
 * Development-only CORS configuration (less restrictive)
 */
export const devCorsConfig: CorsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['*'],
  maxAge: 300
};

/**
 * Get CORS configuration based on environment
 */
export const getCorsConfig = (strict: boolean = false): CorsOptions => {
  if (process.env.NODE_ENV === 'development' && !process.env.FORCE_STRICT_CORS) {
    return devCorsConfig;
  }
  
  return strict ? strictCorsConfig : corsConfig;
};

/**
 * CORS error handler middleware
 */
export const corsErrorHandler = (err: any, req: any, res: any, next: any) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Cross-Origin Request Blocked',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      timestamp: new Date().toISOString(),
      origin: req.get('Origin'),
      allowedOrigins: process.env.NODE_ENV === 'development' ? getAllowedOrigins() : undefined
    });
  }
  next(err);
};