/**
 * 段階的Content Security Policy設定
 * Level 1: 緩い（移行用・report-only）
 * Level 2: 段階的強化（nonce使用）
 * Level 3: 厳格（本番推奨）
 */

import { Request, Response } from 'express';
import crypto from 'crypto';

export interface CSPConfig {
  reportOnly: boolean;
  directives: {
    [key: string]: string[] | ((req: Request, res: Response) => string)[];
  };
  reportUri?: string;
}

export interface CSPLevels {
  level1: CSPConfig;
  level2: CSPConfig;
  level3: CSPConfig;
}

/**
 * nonce生成関数
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * 段階的CSP設定
 */
export const cspConfig: CSPLevels = {
  // Level 1: 初期移行用（report-only）
  level1: {
    reportOnly: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", // 暫定
        "'unsafe-eval'", // 暫定
        "https://www.googletagmanager.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // 暫定
        "https://cdnjs.cloudflare.com",
        "https://fonts.googleapis.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "blob:",
        "https:", // 暫定
        "http:" // 暫定
      ],
      connectSrc: [
        "'self'",
        "wss://localhost:*",
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
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    },
    reportUri: "/api/csp-report"
  },

  // Level 2: 段階的強化（nonce使用）
  level2: {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // nonce関数は後でミドルウェアで処理
        "https://www.googletagmanager.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'",
        // nonce関数は後でミドルウェアで処理
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "blob:",
        "https://secure-image-sources.com" // 制限された外部ソース
      ],
      connectSrc: [
        "'self'",
        "wss://localhost:*",
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
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    },
    reportUri: "/api/csp-report"
  },

  // Level 3: 厳格（本番推奨）
  level3: {
    reportOnly: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // 本番ではnonceのみ使用
        "https://www.googletagmanager.com"
      ],
      styleSrc: [
        "'self'",
        // 本番ではnonceのみ使用
        "https://fonts.googleapis.com"
      ],
      imgSrc: [
        "'self'", 
        "data:",
        // blobやhttps:は除去（厳格）
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
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
      blockAllMixedContent: []
    },
    reportUri: "/api/csp-report"
  }
};

/**
 * 環境別CSPレベル設定
 */
export const environmentCSPLevels = {
  development: 'level1', // 開発環境: 緩い設定（report-only）
  staging: 'level2',     // ステージング: 段階的強化
  production: 'level3'   // 本番: 厳格設定
} as const;

/**
 * 現在の環境に適したCSP設定を取得
 */
export function getCurrentCSPConfig(): CSPConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const cspLevel = process.env.CSP_LEVEL || environmentCSPLevels[nodeEnv as keyof typeof environmentCSPLevels];
  
  return cspConfig[cspLevel as keyof CSPLevels] || cspConfig.level1;
}

/**
 * CSPディレクティブを文字列に変換
 */
export function buildCSPString(config: CSPConfig, nonce?: string): string {
  const directives: string[] = [];
  
  for (const [directive, sources] of Object.entries(config.directives)) {
    if (Array.isArray(sources) && sources.length > 0) {
      let sourceList = sources.map(source => {
        // nonce置換処理
        if (typeof source === 'string') {
          if (directive === 'scriptSrc' || directive === 'styleSrc') {
            if (source === "'self'" || source.startsWith('https://')) {
              return source;
            }
            // unsafe-inlineがある場合はnonceで置換
            if (source === "'unsafe-inline'" && nonce) {
              return `'nonce-${nonce}'`;
            }
          }
          return source;
        }
        return source;
      }).filter(Boolean);
      
      // 重複削除
      sourceList = Array.from(new Set(sourceList));
      
      if (sourceList.length > 0) {
        const kebabCase = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
        directives.push(`${kebabCase} ${sourceList.join(' ')}`);
      }
    }
  }
  
  return directives.join('; ');
}

/**
 * CSPレポート用の型定義
 */
export interface CSPReport {
  'csp-report': {
    'document-uri': string;
    'referrer': string;
    'violated-directive': string;
    'effective-directive': string;
    'original-policy': string;
    'disposition': string;
    'blocked-uri': string;
    'status-code': number;
    'script-sample': string;
  };
}