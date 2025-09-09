/**
 * CSPレポートエンドポイント実装
 */

import { Router, Request, Response } from 'express';
import { logCSPViolation, getCSPStats } from '../middleware/csp.js';
import { CSPReport } from '../config/csp.js';

const router = Router();

/**
 * CSP違反レポート受信エンドポイント
 */
router.post('/csp-report', (req: Request, res: Response) => {
  try {
    const report: CSPReport = req.body;
    
    if (!report || !report['csp-report']) {
      return res.status(400).json({
        error: 'Invalid CSP report format',
        message: 'CSPレポートの形式が不正です'
      });
    }
    
    const violation = report['csp-report'];
    
    // CSP違反をログに記録
    logCSPViolation(violation, req);
    
    // 簡単な分析情報を生成
    const analysis = {
      severity: getSeverityLevel(violation['violated-directive']),
      recommendation: getRecommendation(violation['violated-directive'], violation['blocked-uri']),
      isKnownIssue: isKnownCSPIssue(violation)
    };
    
    // 成功レスポンス
    res.status(204).send(); // No Content
    
    // 開発環境では詳細情報を別途ログ出力
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 CSP Violation Analysis:', analysis);
    }
    
  } catch (error) {
    console.error('❌ CSP Report Processing Error:', error);
    res.status(500).json({
      error: 'Failed to process CSP report',
      message: 'CSPレポートの処理に失敗しました'
    });
  }
});

/**
 * CSP統計情報取得エンドポイント（開発環境のみ）
 */
router.get('/csp-stats', (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    const stats = getCSPStats();
    res.json({
      success: true,
      data: stats,
      message: 'CSP統計情報を取得しました'
    });
  } catch (error) {
    console.error('❌ CSP Stats Error:', error);
    res.status(500).json({
      error: 'Failed to get CSP stats',
      message: 'CSP統計情報の取得に失敗しました'
    });
  }
});

/**
 * CSPレベル変更エンドポイント（開発環境のみ）
 */
router.post('/csp-level', (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    const { level } = req.body;
    const validLevels = ['level1', 'level2', 'level3'];
    
    if (!level || !validLevels.includes(level)) {
      return res.status(400).json({
        error: 'Invalid CSP level',
        message: 'CSPレベルが不正です',
        validLevels
      });
    }
    
    process.env.CSP_LEVEL = level;
    
    res.json({
      success: true,
      message: `CSPレベルを${level}に変更しました`,
      currentLevel: level,
      effectiveNextRequest: true
    });
    
    console.log(`🔧 CSP Level manually changed to: ${level}`);
    
  } catch (error) {
    console.error('❌ CSP Level Change Error:', error);
    res.status(500).json({
      error: 'Failed to change CSP level',
      message: 'CSPレベルの変更に失敗しました'
    });
  }
});

/**
 * CSP違反の重要度判定
 */
function getSeverityLevel(violatedDirective: string): 'low' | 'medium' | 'high' | 'critical' {
  const criticalDirectives = ['script-src', 'object-src'];
  const highDirectives = ['style-src', 'img-src'];
  const mediumDirectives = ['font-src', 'connect-src'];
  
  if (criticalDirectives.some(d => violatedDirective.includes(d))) {
    return 'critical';
  } else if (highDirectives.some(d => violatedDirective.includes(d))) {
    return 'high';
  } else if (mediumDirectives.some(d => violatedDirective.includes(d))) {
    return 'medium';
  }
  return 'low';
}

/**
 * CSP違反に対する推奨事項生成
 */
function getRecommendation(violatedDirective: string, blockedUri: string): string {
  if (violatedDirective.includes('script-src')) {
    if (blockedUri === 'inline') {
      return 'インラインスクリプトをnonceまたはhashで許可するか、外部ファイルに移動してください';
    } else if (blockedUri.includes('eval')) {
      return 'eval()の使用を避け、安全な代替手段を検討してください';
    } else {
      return `スクリプトソース ${blockedUri} を script-src ディレクティブに追加してください`;
    }
  } else if (violatedDirective.includes('style-src')) {
    if (blockedUri === 'inline') {
      return 'インラインスタイルをnonceまたはhashで許可するか、外部CSSファイルに移動してください';
    } else {
      return `スタイルソース ${blockedUri} を style-src ディレクティブに追加してください`;
    }
  } else if (violatedDirective.includes('img-src')) {
    return `画像ソース ${blockedUri} を img-src ディレクティブに追加してください`;
  }
  
  return `${violatedDirective} ディレクティブの設定を確認し、必要に応じて ${blockedUri} を許可してください`;
}

/**
 * 既知のCSP問題かどうかの判定
 */
function isKnownCSPIssue(violation: any): boolean {
  const knownIssues = [
    'chrome-extension:', // Chrome拡張機能
    'moz-extension:', // Firefox拡張機能
    'safari-extension:', // Safari拡張機能
    'about:blank', // ブランクページ
    'data:text/html;base64' // Data URI
  ];
  
  return knownIssues.some(issue => 
    violation['blocked-uri']?.includes(issue) ||
    violation['document-uri']?.includes(issue)
  );
}

export { router as cspRouter };