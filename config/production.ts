/**
 * Production Configuration Module
 * 
 * This module contains production-specific configurations and security settings.
 * All values should be loaded from environment variables for security.
 */

export interface ProductionConfig {
  // Core application settings
  nodeEnv: string;
  port: number;
  
  // Database configuration
  database: {
    url: string;
    poolSize: number;
    connectionTimeout: number;
    sslMode: boolean;
  };
  
  // Security settings
  security: {
    jwtSecret: string;
    sessionSecret: string;
    jwtExpiresIn: string;
    refreshTokenExpiresIn: string;
    forceHttps: boolean;
    csrfEnabled: boolean;
    rateLimiting: {
      api: number;
      upload: number;
      auth: number;
      register: number;
      quiz: number;
    };
  };
  
  // SSL/TLS configuration
  ssl: {
    enabled: boolean;
    certPath?: string;
    keyPath?: string;
    hsts: {
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
  };
  
  // Logging and monitoring
  logging: {
    level: string;
    format: string;
    securityLogFile: string;
    auditLogEnabled: boolean;
    auditLogRetentionDays: number;
  };
  
  // File upload restrictions
  uploads: {
    maxFileSize: number;
    allowedTypes: string[];
    virusScanEnabled: boolean;
  };
  
  // Performance settings
  performance: {
    maxMemoryUsage: number;
    maxCpuUsage: number;
    workerThreads: number;
    enableCache: boolean;
  };
  
  // External services
  services: {
    geminiApiKey: string;
    googleApiKey: string;
  };
}

/**
 * Load and validate production configuration from environment variables
 */
export function loadProductionConfig(): ProductionConfig {
  // Validate required environment variables
  const requiredEnvVars = [
    'NODE_ENV',
    'DATABASE_URL', 
    'JWT_SECRET',
    'SESSION_SECRET',
    'GEMINI_API_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  // Validate JWT_SECRET strength
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long for production');
  }
  
  // Validate SESSION_SECRET strength  
  const sessionSecret = process.env.SESSION_SECRET!;
  if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long for production');
  }
  
  if (jwtSecret === sessionSecret) {
    throw new Error('JWT_SECRET and SESSION_SECRET must be different');
  }
  
  return {
    nodeEnv: process.env.NODE_ENV!,
    port: parseInt(process.env.PORT || '5000', 10),
    
    database: {
      url: process.env.DATABASE_URL!,
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000', 10),
      sslMode: process.env.DATABASE_URL!.includes('sslmode=require')
    },
    
    security: {
      jwtSecret,
      sessionSecret,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      forceHttps: process.env.FORCE_HTTPS === 'true',
      csrfEnabled: process.env.CSRF_ENABLED !== 'false',
      rateLimiting: {
        api: parseInt(process.env.API_RATE_LIMIT || '100', 10),
        upload: parseInt(process.env.UPLOAD_RATE_LIMIT || '10', 10),
        auth: parseInt(process.env.AUTH_RATE_LIMIT || '5', 10),
        register: parseInt(process.env.REGISTER_RATE_LIMIT || '3', 10),
        quiz: parseInt(process.env.QUIZ_RATE_LIMIT || '20', 10)
      }
    },
    
    ssl: {
      enabled: process.env.FORCE_HTTPS === 'true',
      certPath: process.env.SSL_CERT_PATH,
      keyPath: process.env.SSL_KEY_PATH,
      hsts: {
        maxAge: parseInt(process.env.HSTS_MAX_AGE || '31536000', 10),
        includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS === 'true',
        preload: process.env.HSTS_PRELOAD === 'true'
      }
    },
    
    logging: {
      level: process.env.LOG_LEVEL || 'warn',
      format: process.env.LOG_FORMAT || 'json',
      securityLogFile: process.env.SECURITY_LOG_FILE || '/var/log/app/security.log',
      auditLogEnabled: process.env.AUDIT_LOG_ENABLED === 'true',
      auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10)
    },
    
    uploads: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
      allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'pdf,txt,doc,docx').split(','),
      virusScanEnabled: process.env.VIRUS_SCAN_ENABLED === 'true'
    },
    
    performance: {
      maxMemoryUsage: parseInt(process.env.MAX_MEMORY_USAGE || '512', 10),
      maxCpuUsage: parseInt(process.env.MAX_CPU_USAGE || '80', 10),
      workerThreads: parseInt(process.env.WORKER_THREADS || '2', 10),
      enableCache: process.env.ENABLE_CACHE !== 'false'
    },
    
    services: {
      geminiApiKey: process.env.GEMINI_API_KEY!,
      googleApiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY!
    }
  };
}

/**
 * Validate production environment readiness
 */
export function validateProductionReadiness(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  try {
    const config = loadProductionConfig();
    
    // Check NODE_ENV
    if (config.nodeEnv !== 'production') {
      issues.push('NODE_ENV must be set to "production"');
    }
    
    // Check HTTPS enforcement
    if (!config.security.forceHttps) {
      issues.push('HTTPS must be enforced in production (FORCE_HTTPS=true)');
    }
    
    // Check database SSL
    if (!config.database.sslMode) {
      issues.push('Database must use SSL in production (sslmode=require in DATABASE_URL)');
    }
    
    // Check secret strength
    if (config.security.jwtSecret === 'CHANGE_ME_TO_64_CHAR_RANDOM_HEX_STRING_FOR_PRODUCTION_USE_ONLY') {
      issues.push('JWT_SECRET must be changed from default template value');
    }
    
    if (config.security.sessionSecret === 'CHANGE_ME_TO_DIFFERENT_64_CHAR_RANDOM_HEX_STRING_FOR_SESSIONS') {
      issues.push('SESSION_SECRET must be changed from default template value');
    }
    
    // Check API keys
    if (config.services.geminiApiKey === 'your_gemini_api_key_here') {
      issues.push('GEMINI_API_KEY must be set to actual API key');
    }
    
  } catch (error) {
    issues.push(`Configuration validation failed: ${(error as Error).message}`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Generate secure random secrets for production use
 */
export function generateSecureSecrets(): { jwtSecret: string; sessionSecret: string } {
  const crypto = require('crypto');
  
  return {
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    sessionSecret: crypto.randomBytes(32).toString('hex')
  };
}