/**
 * CSPミドルウェア実装
 * nonce生成機能付き
 */

import { Request, Response, NextFunction } from 'express';
import { generateNonce, getCurrentCSPConfig, buildCSPString } from '../config/csp.js';

/**
 * CSPミドルウェア用のExpressリクエスト拡張
 */
declare global {
  namespace Express {
    interface Locals {
      nonce: string;
      cspLevel: string;
    }
  }
}

/**
 * nonce生成ミドルウェア
 */
export function generateCSPNonce(req: Request, res: Response, next: NextFunction): void {
  // 各リクエストに対してユニークなnonceを生成
  res.locals.nonce = generateNonce();
  res.locals.cspLevel = process.env.CSP_LEVEL || 'level1';
  
  // HTMLテンプレートで使用できるようにヘルパー関数を追加
  res.locals.getNonce = () => res.locals.nonce;
  res.locals.getCSPLevel = () => res.locals.cspLevel;
  
  next();
}

/**
 * メインCSPミドルウェア
 */
export function applyCSP(req: Request, res: Response, next: NextFunction): void {
  const config = getCurrentCSPConfig();
  const nonce = res.locals.nonce;
  
  // CSP文字列を構築
  const cspString = buildCSPString(config, nonce);
  
  // CSPヘッダーを設定
  const headerName = config.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  res.setHeader(headerName, cspString);
  
  // レポート用URIを設定（もしあれば）
  if (config.reportUri) {
    const reportToValue = JSON.stringify({
      group: "csp-endpoint",
      max_age: 86400,
      endpoints: [{ url: config.reportUri }]
    });
    res.setHeader('Report-To', reportToValue);
  }
  
  // デバッグ情報をヘッダーに追加（開発環境のみ）
  if (process.env.NODE_ENV === 'development') {
    res.setHeader('X-CSP-Level', res.locals.cspLevel);
    res.setHeader('X-CSP-Nonce', nonce);
  }
  
  next();
}

/**
 * CSP違反ログ記録ミドルウェア
 */
export function logCSPViolation(violation: any, req: Request): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type: 'CSP_VIOLATION',
    clientIP: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    violation: {
      documentUri: violation['document-uri'],
      violatedDirective: violation['violated-directive'],
      effectiveDirective: violation['effective-directive'],
      blockedUri: violation['blocked-uri'],
      originalPolicy: violation['original-policy'],
      disposition: violation.disposition,
      statusCode: violation['status-code'],
      scriptSample: violation['script-sample']
    }
  };
  
  // コンソールログ出力
  console.warn('🚨 CSP Violation Detected:', JSON.stringify(logEntry, null, 2));
  
  // 本番環境では外部ログサービスへの送信を実装
  if (process.env.NODE_ENV === 'production') {
    // TODO: 外部ログサービス（Sentry, DataDog等）への送信
    // sendToLogService(logEntry);
  }
}

/**
 * インラインスクリプト用nonce属性生成ヘルパー
 */
export function getScriptNonce(res: Response): string {
  return res.locals.nonce || '';
}

/**
 * インラインスタイル用nonce属性生成ヘルパー
 */
export function getStyleNonce(res: Response): string {
  return res.locals.nonce || '';
}

/**
 * CSPレベル動的変更機能（デバッグ用）
 */
export function changeCSPLevel(req: Request, res: Response, next: NextFunction): void {
  const newLevel = req.query.cspLevel as string;
  const validLevels = ['level1', 'level2', 'level3'];
  
  if (newLevel && validLevels.includes(newLevel)) {
    process.env.CSP_LEVEL = newLevel;
    res.locals.cspLevel = newLevel;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔧 CSP Level changed to: ${newLevel}`);
    }
  }
  
  next();
}

/**
 * CSP統計情報取得
 */
export function getCSPStats() {
  return {
    currentLevel: process.env.CSP_LEVEL || 'level1',
    environment: process.env.NODE_ENV || 'development',
    reportOnly: getCurrentCSPConfig().reportOnly,
    timestamp: new Date().toISOString()
  };
}