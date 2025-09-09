/**
 * HTML Template Utilities with CSP Nonce Support
 * 動的なnonce付きHTMLテンプレート生成
 */

import { Request } from 'express';
import { getNonceForScript, getNonceForStyle } from '../middleware/csp.js';

/**
 * CSP対応のindex.htmlテンプレート生成
 */
export function generateSecureIndexHtml(req: Request, originalHtml: string): string {
  const scriptNonce = getNonceForScript(req);
  const styleNonce = getNonceForStyle(req);
  
  // 既存のインラインscriptタグにnonceを追加
  let processedHtml = originalHtml.replace(
    /<script(?![^>]*src=)([^>]*)>/g,
    `<script nonce="${scriptNonce}"$1>`
  );
  
  // 既存のインラインstyleタグにnonceを追加
  processedHtml = processedHtml.replace(
    /<style([^>]*)>/g,
    `<style nonce="${styleNonce}"$1>`
  );
  
  // Vite development用のスクリプトにもnonceを適用
  if (process.env.NODE_ENV === 'development') {
    // Vite client script
    processedHtml = processedHtml.replace(
      /<script type="module" src="[^"]*@vite\/client"([^>]*)>/g,
      `<script type="module" src="/@vite/client" nonce="${scriptNonce}"$1>`
    );
    
    // メインのViteスクリプト
    processedHtml = processedHtml.replace(
      /<script type="module" src="[^"]*src\/main\.tsx"([^>]*)>/g,
      `<script type="module" src="/src/main.tsx" nonce="${scriptNonce}"$1>`
    );
  }
  
  return processedHtml;
}

/**
 * インラインCSS用のnonce付きstyleタグ生成
 */
export function createNonceStyleTag(req: Request, css: string): string {
  const nonce = getNonceForStyle(req);
  return `<style nonce="${nonce}">${css}</style>`;
}

/**
 * インラインJS用のnonce付きscriptタグ生成
 */
export function createNonceScriptTag(req: Request, js: string): string {
  const nonce = getNonceForScript(req);
  return `<script nonce="${nonce}">${js}</script>`;
}

/**
 * 外部リソース用のスクリプトタグ生成（nonce不要）
 */
export function createExternalScriptTag(src: string, attributes: Record<string, string> = {}): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  
  return `<script src="${src}" ${attrs}></script>`;
}

/**
 * インラインスタイルがあるかチェック
 */
export function hasInlineStyles(html: string): boolean {
  return /<style(?![^>]*src=)[^>]*>/.test(html);
}

/**
 * インラインスクリプトがあるかチェック
 */
export function hasInlineScripts(html: string): boolean {
  return /<script(?![^>]*src=)[^>]*>/.test(html);
}

/**
 * CSP違反となる可能性があるコンテンツの検出
 */
export function detectCSPViolations(html: string): string[] {
  const violations: string[] = [];
  
  // style属性の検出
  if (/style\s*=/.test(html)) {
    violations.push('Inline style attributes detected (style="...")');
  }
  
  // onclick等のイベントハンドラの検出
  if (/on\w+\s*=/.test(html)) {
    violations.push('Inline event handlers detected (onclick="...", onload="...", etc.)');
  }
  
  // javascript:プロトコルの検出
  if (/javascript:/.test(html)) {
    violations.push('Javascript: protocol detected in href or src');
  }
  
  // data:text/html URIの検出
  if (/data:text\/html/.test(html)) {
    violations.push('Data URI with HTML content detected');
  }
  
  return violations;
}

/**
 * HTMLテンプレートのCSP対応度チェック
 */
export function validateCSPCompliance(html: string): {
  isCompliant: boolean;
  violations: string[];
  suggestions: string[];
} {
  const violations = detectCSPViolations(html);
  const suggestions: string[] = [];
  
  if (hasInlineStyles(html)) {
    suggestions.push('Move inline styles to external CSS files or use nonce-based CSP');
  }
  
  if (hasInlineScripts(html)) {
    suggestions.push('Move inline scripts to external JS files or use nonce-based CSP');
  }
  
  if (violations.includes('Inline style attributes detected (style="...")')) {
    suggestions.push('Replace style attributes with CSS classes');
  }
  
  if (violations.includes('Inline event handlers detected (onclick="...", onload="...", etc.)')) {
    suggestions.push('Use addEventListener() in external JavaScript files');
  }
  
  return {
    isCompliant: violations.length === 0,
    violations,
    suggestions
  };
}