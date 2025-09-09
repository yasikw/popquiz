/**
 * HTML Nonce Injection Middleware
 * ViteサーバーのHTMLにnonceを注入するミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { getNonceForScript, getNonceForStyle } from './csp.js';

/**
 * HTML レスポンスにnonceを注入するミドルウェア
 */
export function htmlNonceInjection(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(body: any): Response {
    // HTMLレスポンスの場合のみ処理
    if (typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
      const scriptNonce = getNonceForScript(req);
      const styleNonce = getNonceForStyle(req);
      
      let processedHtml = body;
      
      // 既存のスクリプトタグにnonceを追加
      processedHtml = processedHtml.replace(
        /<script(\s+[^>]*)?(?!\s+nonce=)(\s+type="module"[^>]*)?(\s+src="[^"]*main\.tsx[^"]*"[^>]*)?>/g,
        `<script nonce="${scriptNonce}"$1$2$3>`
      );
      
      // Replitバナー用スクリプトにnonceを追加
      processedHtml = processedHtml.replace(
        /<script(\s+[^>]*)?(?!\s+nonce=)(\s+type="text\/javascript"[^>]*)?(\s+src="[^"]*replit-dev-banner\.js[^"]*"[^>]*)?>/g,
        `<script nonce="${scriptNonce}"$1$2$3>`
      );
      
      // 他の外部スクリプトにもnonceを追加（必要に応じて）
      processedHtml = processedHtml.replace(
        /<script(?![^>]*nonce=)([^>]*src="[^"]*"[^>]*)>/g,
        `<script nonce="${scriptNonce}"$1>`
      );
      
      // インラインスクリプトにnonceを追加
      processedHtml = processedHtml.replace(
        /<script(?![^>]*(?:src=|nonce=))([^>]*)>/g,
        `<script nonce="${scriptNonce}"$1>`
      );
      
      // インラインスタイルにnonceを追加
      processedHtml = processedHtml.replace(
        /<style(?![^>]*nonce=)([^>]*)>/g,
        `<style nonce="${styleNonce}"$1>`
      );
      
      // 開発環境での注入結果ログ
      if (process.env.NODE_ENV === 'development') {
        const scriptMatches = (processedHtml.match(/nonce="[^"]*"/g) || []).length;
        if (scriptMatches > 0) {
          console.log(`🔧 HTML Nonce Injection: ${scriptMatches} tags processed`);
        }
      }
      
      return originalSend.call(this, processedHtml);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}

/**
 * CSP違反検出とレポート
 */
export function cspViolationReporter(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(body: any): Response {
    if (typeof body === 'string' && body.includes('<!DOCTYPE html>')) {
      // CSP違反の可能性をチェック
      const violations: string[] = [];
      
      // nonceなしのインラインスクリプト
      if (/<script(?![^>]*(?:src=|nonce=))[^>]*>/.test(body)) {
        violations.push('Inline script without nonce detected');
      }
      
      // nonceなしのインラインスタイル
      if (/<style(?![^>]*nonce=)[^>]*>/.test(body)) {
        violations.push('Inline style without nonce detected');
      }
      
      // style属性の使用
      if (/\sstyle\s*=/.test(body)) {
        violations.push('Inline style attributes detected');
      }
      
      // イベントハンドラの使用
      if (/\son\w+\s*=/.test(body)) {
        violations.push('Inline event handlers detected');
      }
      
      if (violations.length > 0 && process.env.NODE_ENV === 'development') {
        console.warn('🚨 Potential CSP Violations:', violations);
      }
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}