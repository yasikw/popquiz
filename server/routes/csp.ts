/**
 * CSPレポートエンドポイント実装
 */

import { Router, Request, Response } from 'express';
import { logCSPViolation, getCSPStats } from '../middleware/csp.js';
import { CSPReport } from '../config/csp.js';
import { cspAnalyzer } from '../utils/csp-analyzer';
import { deploymentManager } from '../utils/deployment-manager';

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
    
    // 詳細分析システムに違反を追加
    const violationData = {
      timestamp: new Date().toISOString(),
      documentUri: violation['document-uri'],
      violatedDirective: violation['violated-directive'],
      effectiveDirective: violation['effective-directive'],
      blockedUri: violation['blocked-uri'],
      originalPolicy: violation['original-policy'],
      disposition: violation['disposition'],
      sourceFile: (violation as any)['source-file'],
      lineNumber: (violation as any)['line-number'],
      columnNumber: (violation as any)['column-number'],
      sample: violation['script-sample'],
      userAgent: req.get('User-Agent') || '',
      clientIP: req.ip || req.connection.remoteAddress || ''
    };
    
    cspAnalyzer.addViolation(violationData);
    
    // アラート判定
    if (cspAnalyzer.shouldAlert(violationData)) {
      console.log('🚨 CSP Critical Violation Alert:', violationData);
      // 実際のプロダクションではSlack/メール通知など
    }
    
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

/**
 * CSP分析レポート取得エンドポイント
 */
router.get('/csp-analysis', (req: Request, res: Response) => {
  try {
    const summary = cspAnalyzer.getViolationSummary();
    const weeklyReport = cspAnalyzer.generateWeeklyReport();
    const deploymentReport = deploymentManager.generateDeploymentReport();
    
    res.json({
      success: true,
      data: {
        violationSummary: summary,
        weeklyReport,
        deploymentStatus: deploymentReport
      },
      message: 'CSP分析レポートを取得しました'
    });
  } catch (error) {
    console.error('❌ CSP Analysis Error:', error);
    res.status(500).json({
      error: 'Failed to get CSP analysis',
      message: 'CSP分析レポートの取得に失敗しました'
    });
  }
});

/**
 * Level2移行準備状況エンドポイント
 */
router.get('/csp-readiness', (req: Request, res: Response) => {
  try {
    const readiness = cspAnalyzer.assessLevel2Readiness();
    const deploymentStatus = deploymentManager.getDeploymentStatus();
    
    res.json({
      success: true,
      data: {
        migrationReadiness: readiness,
        deploymentStatus,
        autoAdvanceCheck: deploymentManager.checkAutoAdvance()
      },
      message: '移行準備状況を取得しました'
    });
  } catch (error) {
    console.error('❌ CSP Readiness Error:', error);
    res.status(500).json({
      error: 'Failed to assess readiness',
      message: '移行準備状況の評価に失敗しました'
    });
  }
});

/**
 * デプロイメントフェーズ進行エンドポイント（開発環境のみ）
 */
router.post('/csp-advance-phase', (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  try {
    const result = deploymentManager.advancePhase();
    
    if (result.success) {
      deploymentManager.saveDeploymentHistory('phase_advance', {
        previousPhase: deploymentManager.getDeploymentStatus().currentPhase,
        newPhase: result.newPhase,
        automatic: false
      });
    }
    
    res.json({
      success: result.success,
      message: result.message,
      data: result.newPhase ? {
        newPhase: result.newPhase,
        deploymentStatus: deploymentManager.getDeploymentStatus()
      } : null
    });
  } catch (error) {
    console.error('❌ Phase Advance Error:', error);
    res.status(500).json({
      error: 'Failed to advance phase',
      message: 'フェーズ進行に失敗しました'
    });
  }
});

/**
 * 週次レポート生成エンドポイント
 */
router.get('/csp-weekly-report', (req: Request, res: Response) => {
  try {
    const weeklyReport = cspAnalyzer.generateWeeklyReport();
    const deploymentReport = deploymentManager.generateDeploymentReport();
    
    // 統合週次レポート
    const consolidatedReport = {
      reportDate: new Date().toISOString(),
      period: weeklyReport.period,
      executive: {
        currentPhase: deploymentReport.phase,
        readyForNextPhase: deploymentReport.status.readyForNextPhase,
        totalViolations: weeklyReport.summary.totalViolations,
        criticalIssues: weeklyReport.summary.criticalIssues,
        overallHealth: weeklyReport.summary.criticalIssues === 0 ? 'Good' : 'Needs Attention'
      },
      security: {
        violationSummary: weeklyReport.summary,
        topViolations: weeklyReport.topViolations,
        migrationReadiness: weeklyReport.migrationReadiness
      },
      deployment: {
        status: deploymentReport.status,
        recommendations: deploymentReport.recommendations,
        nextSteps: deploymentReport.nextSteps
      },
      actionItems: [
        ...weeklyReport.actionItems,
        ...deploymentReport.nextSteps
      ]
    };
    
    res.json({
      success: true,
      data: consolidatedReport,
      message: '週次レポートを生成しました'
    });
  } catch (error) {
    console.error('❌ Weekly Report Error:', error);
    res.status(500).json({
      error: 'Failed to generate weekly report',
      message: '週次レポートの生成に失敗しました'
    });
  }
});

export { router as cspRouter };