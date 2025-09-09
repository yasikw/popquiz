/**
 * 段階的CSP強化システム
 * report-only → enforce mode への段階的移行
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';

interface CSPViolationLog {
  timestamp: string;
  violatedDirective: string;
  blockedUri: string;
  documentUri: string;
  sourceFile?: string;
  lineNumber?: number;
  userAgent: string;
}

interface CSPEnforcementConfig {
  enabled: boolean;
  enforceAfterDays: number;
  minViolationThreshold: number;
  whitelistedViolations: string[];
  lastReview: string;
}

/**
 * CSP強化設定ファイルのパス
 */
const CSP_CONFIG_PATH = path.join(process.cwd(), 'csp-enforcement.json');

/**
 * CSP違反ログファイルのパス
 */
const CSP_VIOLATIONS_PATH = path.join(process.cwd(), 'csp-violations.log');

/**
 * デフォルトのCSP強化設定
 */
const DEFAULT_CSP_CONFIG: CSPEnforcementConfig = {
  enabled: false,
  enforceAfterDays: 7, // 7日間のモニタリング後に強制モードに移行
  minViolationThreshold: 100, // 100回未満の違反は無視
  whitelistedViolations: [
    'style-src-elem inline', // Vite開発環境でのインラインスタイル
    'script-src-elem eval', // Vite開発環境でのeval使用
  ],
  lastReview: new Date().toISOString()
};

/**
 * CSP強化設定の読み込み
 */
async function loadCSPConfig(): Promise<CSPEnforcementConfig> {
  try {
    const configData = await fs.readFile(CSP_CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CSP_CONFIG, ...JSON.parse(configData) };
  } catch {
    // 設定ファイルが存在しない場合はデフォルト設定を作成
    await saveCSPConfig(DEFAULT_CSP_CONFIG);
    return DEFAULT_CSP_CONFIG;
  }
}

/**
 * CSP強化設定の保存
 */
async function saveCSPConfig(config: CSPEnforcementConfig): Promise<void> {
  await fs.writeFile(CSP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * CSP違反の記録
 */
async function logCSPViolation(violation: CSPViolationLog): Promise<void> {
  const logEntry = JSON.stringify(violation) + '\n';
  await fs.appendFile(CSP_VIOLATIONS_PATH, logEntry);
}

/**
 * CSP違反ログの読み込み
 */
async function loadCSPViolations(): Promise<CSPViolationLog[]> {
  try {
    const logData = await fs.readFile(CSP_VIOLATIONS_PATH, 'utf-8');
    return logData
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * CSP違反統計の分析
 */
async function analyzeCSPViolations(): Promise<{
  totalViolations: number;
  violationsByDirective: Record<string, number>;
  uniqueViolations: string[];
  shouldEnforce: boolean;
  recommendations: string[];
}> {
  const violations = await loadCSPViolations();
  const config = await loadCSPConfig();
  
  const violationsByDirective: Record<string, number> = {};
  const uniqueViolations = new Set<string>();
  
  violations.forEach(violation => {
    const key = `${violation.violatedDirective} ${violation.blockedUri}`;
    violationsByDirective[key] = (violationsByDirective[key] || 0) + 1;
    uniqueViolations.add(key);
  });
  
  // 強制モード移行の判定
  const configAge = Date.now() - new Date(config.lastReview).getTime();
  const daysSinceReview = configAge / (1000 * 60 * 60 * 24);
  
  // ホワイトリスト済み違反を除外
  const nonWhitelistedViolations = Array.from(uniqueViolations).filter(
    violation => !config.whitelistedViolations.some(whitelisted => 
      violation.includes(whitelisted)
    )
  );
  
  const shouldEnforce = 
    daysSinceReview >= config.enforceAfterDays &&
    nonWhitelistedViolations.length < config.minViolationThreshold &&
    process.env.NODE_ENV === 'production';
  
  const recommendations: string[] = [];
  
  if (nonWhitelistedViolations.length > 0) {
    recommendations.push(`${nonWhitelistedViolations.length}件の未対応違反があります`);
  }
  
  if (daysSinceReview >= config.enforceAfterDays) {
    recommendations.push('CSP強制モードへの移行を検討してください');
  }
  
  if (violations.length > config.minViolationThreshold) {
    recommendations.push('CSP設定の見直しが必要です');
  }
  
  return {
    totalViolations: violations.length,
    violationsByDirective,
    uniqueViolations: Array.from(uniqueViolations),
    shouldEnforce,
    recommendations
  };
}

/**
 * 段階的CSP強化ミドルウェア
 */
export function gradualCSPEnforcement(req: Request, res: Response, next: NextFunction): void {
  // CSP違反レポートの処理を拡張
  if (req.path === '/api/csp-report' && req.method === 'POST') {
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // CSP違反をログに記録
      if (req.body && req.body['csp-report']) {
        const report = req.body['csp-report'];
        const violation: CSPViolationLog = {
          timestamp: new Date().toISOString(),
          violatedDirective: report['violated-directive'] || 'unknown',
          blockedUri: report['blocked-uri'] || 'unknown',
          documentUri: report['document-uri'] || 'unknown',
          sourceFile: report['source-file'],
          lineNumber: report['line-number'],
          userAgent: req.get('User-Agent') || 'unknown'
        };
        
        // 非同期でログに記録（レスポンスを遅延させない）
        logCSPViolation(violation).catch(console.error);
      }
      
      return originalJson.call(this, body);
    };
  }
  
  next();
}

/**
 * CSP分析レポートエンドポイント
 */
export async function cspAnalysisReport(req: Request, res: Response): Promise<void> {
  try {
    const analysis = await analyzeCSPViolations();
    const config = await loadCSPConfig();
    
    res.json({
      success: true,
      analysis,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSP analysis report',
      message: (error as Error).message
    });
  }
}

/**
 * CSP強制モード切り替えエンドポイント
 */
export async function toggleCSPEnforcement(req: Request, res: Response): Promise<void> {
  try {
    const config = await loadCSPConfig();
    const { enabled } = req.body;
    
    if (typeof enabled === 'boolean') {
      config.enabled = enabled;
      config.lastReview = new Date().toISOString();
      await saveCSPConfig(config);
      
      res.json({
        success: true,
        message: `CSP enforcement ${enabled ? 'enabled' : 'disabled'}`,
        config
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected: { enabled: boolean }'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to toggle CSP enforcement',
      message: (error as Error).message
    });
  }
}

/**
 * CSP違反ログのクリア
 */
export async function clearCSPViolations(req: Request, res: Response): Promise<void> {
  try {
    await fs.writeFile(CSP_VIOLATIONS_PATH, '');
    
    res.json({
      success: true,
      message: 'CSP violation logs cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear CSP violations',
      message: (error as Error).message
    });
  }
}