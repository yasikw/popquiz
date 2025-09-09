/**
 * CSP Nonce Middleware
 * 動的nonce生成とCSPヘッダー設定
 */

import { Request, Response, NextFunction } from 'express';
import { generateNonce, buildCSPHeader, getCSPConfig, shouldEnforceCSP } from '../config/csp.js';

// Request型の拡張
declare global {
  namespace Express {
    interface Request {
      cspNonce?: string;
    }
  }
}

/**
 * CSP Nonce生成ミドルウェア
 */
export function cspNonceMiddleware(req: Request, res: Response, next: NextFunction): void {
  // nonce生成
  const nonce = generateNonce();
  req.cspNonce = nonce;
  
  // CSP設定取得
  const config = getCSPConfig();
  const enforceMode = shouldEnforceCSP() && config.enforceMode;
  
  // CSPヘッダー生成
  const cspHeader = buildCSPHeader(config, nonce);
  
  // ヘッダー設定
  const headerName = enforceMode ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  res.setHeader(headerName, cspHeader);
  
  // 開発環境でのCSP情報ログ
  if (process.env.NODE_ENV === 'development') {
    console.log(`🛡️ CSP Mode: ${enforceMode ? 'ENFORCE' : 'REPORT-ONLY'}`);
    console.log(`🔑 CSP Nonce: ${nonce.substring(0, 8)}...`);
  }
  
  next();
}

/**
 * インラインスクリプト用のnonce付与ヘルパー
 */
export function getNonceForScript(req: Request): string {
  return req.cspNonce || '';
}

/**
 * インラインスタイル用のnonce付与ヘルパー
 */
export function getNonceForStyle(req: Request): string {
  return req.cspNonce || '';
}

/**
 * CSP違反検出ミドルウェア
 */
export function cspViolationDetector(req: Request, res: Response, next: NextFunction): void {
  // レスポンス完了時のチェック
  const originalSend = res.send;
  
  res.send = function(body: any) {
    // HTMLレスポンスでインライン要素をチェック
    if (typeof body === 'string' && body.includes('<script') && !body.includes('nonce=')) {
      console.warn('⚠️ CSP Warning: Inline script detected without nonce');
    }
    
    if (typeof body === 'string' && body.includes('<style') && !body.includes('nonce=')) {
      console.warn('⚠️ CSP Warning: Inline style detected without nonce');
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}

/**
 * CSP設定デバッグ情報
 */
export function cspDebugInfo(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development' && req.path === '/api/csp-debug') {
    const config = getCSPConfig();
    const nonce = req.cspNonce || 'not-generated';
    
    res.json({
      environment: process.env.NODE_ENV,
      enforceMode: shouldEnforceCSP() && config.enforceMode,
      nonce: nonce.substring(0, 8) + '...',
      config: {
        ...config,
        directives: Object.keys(config.directives)
      }
    });
    return;
  }
  
  next();
}