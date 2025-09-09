/**
 * CSP段階的デプロイメント管理システム
 */

import { cspAnalyzer } from './csp-analyzer';

export type DeploymentPhase = 'phase1' | 'phase2' | 'phase3';

interface DeploymentConfig {
  phase: DeploymentPhase;
  startDate: Date;
  duration: number; // days
  autoAdvance: boolean;
  migrationThreshold: {
    maxCriticalViolations: number;
    maxWeeklyViolations: number;
    requiredStabilityDays: number;
  };
}

interface DeploymentStatus {
  currentPhase: DeploymentPhase;
  daysSinceStart: number;
  remainingDays: number;
  autoAdvanceEnabled: boolean;
  readyForNextPhase: boolean;
  blockers: string[];
  nextPhaseRecommendation: string;
}

/**
 * デプロイメント管理クラス
 */
export class DeploymentManager {
  private config: DeploymentConfig;
  
  constructor() {
    this.config = {
      phase: 'phase1',
      startDate: new Date(),
      duration: 7, // デフォルト1週間
      autoAdvance: false, // 手動制御
      migrationThreshold: {
        maxCriticalViolations: 0,
        maxWeeklyViolations: 10,
        requiredStabilityDays: 3
      }
    };
    
    // 環境変数からの設定読み込み
    this.loadFromEnvironment();
  }

  /**
   * 環境変数からの設定読み込み
   */
  private loadFromEnvironment(): void {
    if (process.env.CSP_DEPLOY_PHASE) {
      this.config.phase = process.env.CSP_DEPLOY_PHASE as DeploymentPhase;
    }
    
    if (process.env.CSP_DEPLOY_START_DATE) {
      this.config.startDate = new Date(process.env.CSP_DEPLOY_START_DATE);
    }
    
    if (process.env.CSP_AUTO_ADVANCE === 'true') {
      this.config.autoAdvance = true;
    }
  }

  /**
   * 現在のデプロイメント状況取得
   */
  getDeploymentStatus(): DeploymentStatus {
    const now = new Date();
    const daysSinceStart = Math.floor(
      (now.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const remainingDays = Math.max(0, this.config.duration - daysSinceStart);
    
    // 次フェーズ準備状況の評価
    const readiness = this.assessNextPhaseReadiness();
    
    return {
      currentPhase: this.config.phase,
      daysSinceStart,
      remainingDays,
      autoAdvanceEnabled: this.config.autoAdvance,
      readyForNextPhase: readiness.ready,
      blockers: readiness.blockers,
      nextPhaseRecommendation: readiness.recommendation
    };
  }

  /**
   * 次フェーズ準備状況評価
   */
  private assessNextPhaseReadiness(): {
    ready: boolean;
    blockers: string[];
    recommendation: string;
  } {
    const blockers: string[] = [];
    let recommendation = '';

    switch (this.config.phase) {
      case 'phase1':
        // Level1 → Level2 移行判定
        const level2Readiness = cspAnalyzer.assessLevel2Readiness();
        
        if (!level2Readiness.readyForMigration) {
          blockers.push(...level2Readiness.blockers);
        }
        
        if (level2Readiness.violationTrends.critical > this.config.migrationThreshold.maxCriticalViolations) {
          blockers.push(`クリティカル違反が${level2Readiness.violationTrends.critical}件残存（上限: ${this.config.migrationThreshold.maxCriticalViolations}件）`);
        }
        
        const weeklyViolations = level2Readiness.violationTrends.weekly[level2Readiness.violationTrends.weekly.length - 1] || 0;
        if (weeklyViolations > this.config.migrationThreshold.maxWeeklyViolations) {
          blockers.push(`週間違反数が${weeklyViolations}件（上限: ${this.config.migrationThreshold.maxWeeklyViolations}件）`);
        }
        
        recommendation = blockers.length === 0 
          ? '✅ Level2（段階的強化）への移行準備完了'
          : '❌ Level2移行前に違反の解決が必要';
        break;

      case 'phase2':
        // Level2 → Level3 移行判定
        const summary = cspAnalyzer.getViolationSummary();
        const criticalViolations = summary.filter(s => 
          s.criticalityLevel === 'critical' || s.criticalityLevel === 'high'
        );
        
        if (criticalViolations.length > 0) {
          blockers.push(`${criticalViolations.length}件の高優先度違反が残存`);
        }
        
        // unsafe-* の使用チェック
        const unsafeViolations = summary.filter(s => 
          s.violationType.includes('unsafe-inline') || s.violationType.includes('unsafe-eval')
        );
        
        if (unsafeViolations.length > 0) {
          blockers.push('unsafe-* ディレクティブの依存が残存');
        }
        
        recommendation = blockers.length === 0 
          ? '✅ Level3（厳格モード）への移行準備完了'
          : '❌ Level3移行前にunsafe-*依存の解消が必要';
        break;

      case 'phase3':
        recommendation = '✅ 最終段階 - 継続的監視モード';
        break;
    }

    return {
      ready: blockers.length === 0,
      blockers,
      recommendation
    };
  }

  /**
   * フェーズ進行
   */
  advancePhase(): {
    success: boolean;
    message: string;
    newPhase?: DeploymentPhase;
  } {
    const readiness = this.assessNextPhaseReadiness();
    
    if (!readiness.ready) {
      return {
        success: false,
        message: `フェーズ進行がブロックされています: ${readiness.blockers.join(', ')}`
      };
    }

    let newPhase: DeploymentPhase;
    switch (this.config.phase) {
      case 'phase1':
        newPhase = 'phase2';
        break;
      case 'phase2':
        newPhase = 'phase3';
        break;
      case 'phase3':
        return {
          success: false,
          message: '既に最終フェーズです'
        };
      default:
        return {
          success: false,
          message: '無効なフェーズです'
        };
    }

    // フェーズ更新
    this.config.phase = newPhase;
    this.config.startDate = new Date();
    
    // 環境変数更新（次回起動時に反映）
    process.env.CSP_DEPLOY_PHASE = newPhase;
    process.env.CSP_DEPLOY_START_DATE = this.config.startDate.toISOString();

    return {
      success: true,
      message: `${this.config.phase} → ${newPhase} への移行完了`,
      newPhase
    };
  }

  /**
   * 自動進行チェック
   */
  checkAutoAdvance(): {
    shouldAdvance: boolean;
    reason: string;
  } {
    if (!this.config.autoAdvance) {
      return { shouldAdvance: false, reason: '自動進行が無効' };
    }

    const status = this.getDeploymentStatus();
    
    // 期間満了チェック
    if (status.remainingDays <= 0) {
      if (status.readyForNextPhase) {
        return { shouldAdvance: true, reason: '期間満了 & 準備完了' };
      } else {
        return { shouldAdvance: false, reason: '期間満了だが準備未完了' };
      }
    }

    // 早期準備完了チェック
    if (status.readyForNextPhase && status.daysSinceStart >= this.config.migrationThreshold.requiredStabilityDays) {
      return { shouldAdvance: true, reason: '安定性確認完了 & 準備完了' };
    }

    return { shouldAdvance: false, reason: '条件未満足' };
  }

  /**
   * デプロイメント履歴保存
   */
  saveDeploymentHistory(action: string, details: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      phase: this.config.phase,
      action,
      details,
      violationSummary: cspAnalyzer.getViolationSummary()
    };

    // 実際のプロダクションではデータベースに保存
    console.log('📊 Deployment History:', JSON.stringify(logEntry, null, 2));
  }

  /**
   * 週次レポート生成（デプロイメント視点）
   */
  generateDeploymentReport(): {
    phase: DeploymentPhase;
    status: DeploymentStatus;
    weeklyAnalysis: any;
    recommendations: string[];
    nextSteps: string[];
  } {
    const status = this.getDeploymentStatus();
    const weeklyAnalysis = cspAnalyzer.generateWeeklyReport();
    
    const recommendations: string[] = [];
    const nextSteps: string[] = [];

    // フェーズ別推奨事項
    switch (this.config.phase) {
      case 'phase1':
        recommendations.push('🔍 Report-Only モードで違反パターンを収集中');
        recommendations.push('📊 毎日のCSPレポート確認を継続');
        
        if (status.readyForNextPhase) {
          nextSteps.push('🚀 Level2（段階的強化）への移行準備完了');
          nextSteps.push('⏭️ 手動でフェーズ進行を実行可能');
        } else {
          nextSteps.push('🔧 残存違反の修正を継続');
          nextSteps.push('📈 違反トレンドの改善を確認');
        }
        break;

      case 'phase2':
        recommendations.push('🛡️ 段階的強化モードで実際のブロック実施中');
        recommendations.push('⚠️ ユーザー影響の監視を強化');
        
        if (status.readyForNextPhase) {
          nextSteps.push('🎯 Level3（厳格）への移行準備完了');
          nextSteps.push('✅ 最終セキュリティ強化の実行可能');
        } else {
          nextSteps.push('🔒 unsafe-* 依存の完全除去');
          nextSteps.push('🧹 残存違反の最終クリーンアップ');
        }
        break;

      case 'phase3':
        recommendations.push('🔒 厳格モードでの運用中');
        recommendations.push('📊 継続的なセキュリティ監視を実施');
        nextSteps.push('🔄 定期的なCSPポリシー見直し');
        nextSteps.push('📈 セキュリティメトリクスの継続追跡');
        break;
    }

    return {
      phase: this.config.phase,
      status,
      weeklyAnalysis,
      recommendations,
      nextSteps
    };
  }
}

// グローバルデプロイメントマネージャーインスタンス
export const deploymentManager = new DeploymentManager();