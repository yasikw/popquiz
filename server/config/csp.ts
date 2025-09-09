/**
 * Content Security Policy Configuration
 * Secure nonce/hash-based CSP for XSS protection
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * CSP環境別設定インターフェース
 */
interface CSPConfig {
  enforceMode: boolean; // true: enforce, false: report-only
  reportUri?: string;
  directives: {
    defaultSrc: string[];
    scriptSrc: string[];
    styleSrc: string[];
    imgSrc: string[];
    connectSrc: string[];
    fontSrc: string[];
    objectSrc: string[];
    mediaSrc: string[];
    frameSrc: string[];
    baseUri: string[];
    formAction: string[];
    frameAncestors: string[];
    upgradeInsecureRequests?: boolean;
  };
}

/**
 * nonce生成
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * ハッシュ生成（静的リソース用）
 */
export function generateSHA256Hash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('base64');
}

/**
 * 本番環境CSP設定（最も厳格）
 */
export const productionCSPConfig: CSPConfig = {
  enforceMode: true,
  reportUri: '/api/csp-report',
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Note: nonce values will be added dynamically
      "https://www.googletagmanager.com"
    ],
    styleSrc: [
      "'self'",
      // Note: nonce values will be added dynamically  
      "https://fonts.googleapis.com"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https:"
    ],
    connectSrc: [
      "'self'",
      "https://generativelanguage.googleapis.com"
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com"
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "blob:", "data:"],
    frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: true
  }
};

/**
 * ステージング環境CSP設定（中程度の厳格さ）
 */
export const stagingCSPConfig: CSPConfig = {
  enforceMode: false, // report-only mode for testing
  reportUri: '/api/csp-report',
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Note: nonce values will be added dynamically
      "https://www.googletagmanager.com",
      "https://cdn.jsdelivr.net"
    ],
    styleSrc: [
      "'self'",
      // Note: nonce values will be added dynamically
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "blob:", 
      "https:",
      "http:" // Allow HTTP for testing
    ],
    connectSrc: [
      "'self'",
      "https://generativelanguage.googleapis.com"
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdnjs.cloudflare.com"
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "blob:", "data:"],
    frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  }
};

/**
 * 開発環境CSP設定（Vite対応）
 */
export const developmentCSPConfig: CSPConfig = {
  enforceMode: false, // report-only mode for development
  reportUri: '/api/csp-report',
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // Note: nonce values will be added dynamically
      // Vite specific - allow eval for HMR in development only
      "'unsafe-eval'", // Only for development Vite
      "https://www.googletagmanager.com",
      "https://cdn.jsdelivr.net"
    ],
    styleSrc: [
      "'self'",
      // Note: nonce values will be added dynamically
      "https://fonts.googleapis.com",
      "https://cdnjs.cloudflare.com"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "https:",
      "http:" // Allow HTTP for development
    ],
    connectSrc: [
      "'self'",
      "wss://localhost:*", // Vite WebSocket HMR
      "ws://localhost:*",  // Vite WebSocket HMR
      "https://generativelanguage.googleapis.com"
    ],
    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdnjs.cloudflare.com"
    ],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", "blob:", "data:"],
    frameSrc: ["'self'", "https://www.youtube.com", "https://youtube.com"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  }
};

/**
 * 環境に応じたCSP設定取得
 */
export function getCSPConfig(): CSPConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionCSPConfig;
    case 'staging':
      return stagingCSPConfig;
    case 'development':
    default:
      return developmentCSPConfig;
  }
}

/**
 * CSPヘッダー文字列生成
 */
export function buildCSPHeader(config: CSPConfig, nonce: string): string {
  const directives: string[] = [];
  
  // 各ディレクティブを処理
  Object.entries(config.directives).forEach(([key, values]) => {
    if (key === 'upgradeInsecureRequests') {
      if (values) {
        directives.push('upgrade-insecure-requests');
      }
      return;
    }
    
    // ディレクティブ名をケバブケースに変換
    const directiveName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    
    // nonce対応ディレクティブの処理
    let processedValues = [...values];
    if (key === 'scriptSrc' || key === 'styleSrc') {
      // unsafe-inlineを除去し、nonceを追加
      processedValues = processedValues.filter(val => val !== "'unsafe-inline'");
      processedValues.push(`'nonce-${nonce}'`);
    }
    
    directives.push(`${directiveName} ${processedValues.join(' ')}`);
  });
  
  // report-uri追加
  if (config.reportUri) {
    directives.push(`report-uri ${config.reportUri}`);
  }
  
  return directives.join('; ');
}

/**
 * CSPレポートエンドポイント
 */
export function cspReportHandler(req: Request, res: Response) {
  try {
    const report = req.body;
    
    // CSP違反をログに記録
    console.warn('🚨 CSP Violation Report:', {
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      violatedDirective: report['csp-report']?.['violated-directive'],
      blockedUri: report['csp-report']?.['blocked-uri'],
      documentUri: report['csp-report']?.['document-uri'],
      lineNumber: report['csp-report']?.['line-number'],
      sourceFile: report['csp-report']?.['source-file']
    });
    
    // 必要に応じて外部監視サービスに送信
    // await sendToMonitoringService(report);
    
    res.status(204).end();
  } catch (error) {
    console.error('CSP Report Handler Error:', error);
    res.status(500).json({ error: 'Failed to process CSP report' });
  }
}

/**
 * 段階的CSP強化の判定
 */
export function shouldEnforceCSP(): boolean {
  const env = process.env.NODE_ENV;
  const forceEnforce = process.env.CSP_ENFORCE === 'true';
  
  // 本番環境では常に強制
  if (env === 'production') {
    return true;
  }
  
  // その他の環境では環境変数で制御
  return forceEnforce;
}