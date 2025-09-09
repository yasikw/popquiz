/**
 * CSPレポート分析・監視システム
 * 段階的デプロイメント支援機能
 */

interface CSPViolation {
  timestamp: string;
  documentUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  blockedUri: string;
  originalPolicy: string;
  disposition: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
  userAgent: string;
  clientIP: string;
}

interface ViolationSummary {
  violationType: string;
  count: number;
  affectedPages: string[];
  criticalityLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
  examples: CSPViolation[];
}

interface MigrationReadinessReport {
  level: 'level1' | 'level2' | 'level3';
  readyForMigration: boolean;
  blockers: string[];
  recommendations: string[];
  riskAssessment: 'low' | 'medium' | 'high';
  violationTrends: {
    total: number;
    critical: number;
    weekly: number[];
  };
}

/**
 * CSP違反レポート分析クラス
 */
export class CSPAnalyzer {
  private violations: CSPViolation[] = [];
  private analysisCache = new Map<string, any>();

  /**
   * 違反レポートを追加
   */
  addViolation(violation: CSPViolation): void {
    this.violations.push(violation);
    
    // 古いレポートのクリーンアップ（1週間以上前）
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.violations = this.violations.filter(v => 
      new Date(v.timestamp) > oneWeekAgo
    );
    
    // キャッシュクリア
    this.analysisCache.clear();
  }

  /**
   * 違反タイプ別サマリー生成
   */
  getViolationSummary(): ViolationSummary[] {
    const cacheKey = 'violation_summary';
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey);
    }

    const summaryMap = new Map<string, ViolationSummary>();

    this.violations.forEach(violation => {
      const key = `${violation.violatedDirective}-${violation.effectiveDirective}`;
      
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          violationType: key,
          count: 0,
          affectedPages: [],
          criticalityLevel: this.assessCriticality(violation),
          recommendedAction: this.getRecommendedAction(violation),
          examples: []
        });
      }

      const summary = summaryMap.get(key)!;
      summary.count++;
      
      if (!summary.affectedPages.includes(violation.documentUri)) {
        summary.affectedPages.push(violation.documentUri);
      }
      
      if (summary.examples.length < 3) {
        summary.examples.push(violation);
      }
    });

    const result = Array.from(summaryMap.values())
      .sort((a, b) => b.count - a.count);

    this.analysisCache.set(cacheKey, result);
    return result;
  }

  /**
   * 週次トレンド分析
   */
  getWeeklyTrends(): number[] {
    const weeks = 4; // 4週間のトレンド
    const trends: number[] = [];
    
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      
      const weeklyCount = this.violations.filter(v => {
        const vDate = new Date(v.timestamp);
        return vDate >= weekStart && vDate < weekEnd;
      }).length;
      
      trends.push(weeklyCount);
    }
    
    return trends;
  }

  /**
   * Level2移行準備状況評価
   */
  assessLevel2Readiness(): MigrationReadinessReport {
    const summary = this.getViolationSummary();
    const weeklyTrends = this.getWeeklyTrends();
    
    // クリティカル違反のチェック
    const criticalViolations = summary.filter(s => 
      s.criticalityLevel === 'critical' || s.criticalityLevel === 'high'
    );
    
    // 違反トレンドの評価
    const recentWeekViolations = weeklyTrends[weeklyTrends.length - 1] || 0;
    const avgViolations = weeklyTrends.reduce((a, b) => a + b, 0) / weeklyTrends.length;
    
    const blockers: string[] = [];
    const recommendations: string[] = [];
    
    // ブロッカーの特定
    if (criticalViolations.length > 0) {
      blockers.push(`${criticalViolations.length}件のクリティカル違反が残存`);
      criticalViolations.forEach(cv => {
        blockers.push(`${cv.violationType}: ${cv.recommendedAction}`);
      });
    }
    
    if (recentWeekViolations > avgViolations * 1.5) {
      blockers.push('違反数が増加傾向にあります');
    }
    
    // 推奨事項の生成
    if (summary.length === 0) {
      recommendations.push('✅ CSP違反が検出されていません - Level2移行可能');
    } else {
      recommendations.push(`${summary.length}種類の違反パターンを修正してください`);
      
      // 上位3つの違反タイプに対する推奨事項
      summary.slice(0, 3).forEach(s => {
        recommendations.push(`• ${s.violationType}: ${s.recommendedAction}`);
      });
    }
    
    // リスク評価
    let riskAssessment: 'low' | 'medium' | 'high' = 'low';
    if (criticalViolations.length > 0) {
      riskAssessment = 'high';
    } else if (summary.length > 5 || recentWeekViolations > 10) {
      riskAssessment = 'medium';
    }

    return {
      level: 'level2',
      readyForMigration: blockers.length === 0,
      blockers,
      recommendations,
      riskAssessment,
      violationTrends: {
        total: this.violations.length,
        critical: criticalViolations.reduce((sum, cv) => sum + cv.count, 0),
        weekly: weeklyTrends
      }
    };
  }

  /**
   * 週次レポート生成
   */
  generateWeeklyReport(): {
    period: string;
    summary: {
      totalViolations: number;
      uniqueViolations: number;
      affectedPages: number;
      criticalIssues: number;
    };
    topViolations: ViolationSummary[];
    migrationReadiness: MigrationReadinessReport;
    actionItems: string[];
  } {
    const summary = this.getViolationSummary();
    const readiness = this.assessLevel2Readiness();
    
    // 期間の計算
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 影響を受けたページの計算
    const affectedPages = new Set<string>();
    this.violations.forEach(v => affectedPages.add(v.documentUri));
    
    // クリティカル問題の計算
    const criticalIssues = summary.filter(s => 
      s.criticalityLevel === 'critical' || s.criticalityLevel === 'high'
    ).length;

    // アクションアイテムの生成
    const actionItems: string[] = [];
    
    if (criticalIssues > 0) {
      actionItems.push(`🚨 ${criticalIssues}件のクリティカル違反を優先修正`);
    }
    
    if (!readiness.readyForMigration) {
      actionItems.push('🔧 Level2移行ブロッカーの解決');
      readiness.blockers.forEach(blocker => {
        actionItems.push(`   • ${blocker}`);
      });
    }
    
    if (summary.length > 0) {
      actionItems.push(`📋 ${summary.length}種類の違反パターンの段階的修正`);
    }
    
    if (readiness.readyForMigration && criticalIssues === 0) {
      actionItems.push('✅ Level2移行準備完了 - 移行実施可能');
    }

    return {
      period: `${weekAgo.toISOString().split('T')[0]} ～ ${now.toISOString().split('T')[0]}`,
      summary: {
        totalViolations: this.violations.length,
        uniqueViolations: summary.length,
        affectedPages: affectedPages.size,
        criticalIssues
      },
      topViolations: summary.slice(0, 5),
      migrationReadiness: readiness,
      actionItems
    };
  }

  /**
   * 違反の重要度評価
   */
  private assessCriticality(violation: CSPViolation): 'low' | 'medium' | 'high' | 'critical' {
    // unsafe-eval使用は常にクリティカル
    if (violation.blockedUri === 'eval' || violation.blockedUri.includes('eval')) {
      return 'critical';
    }
    
    // インラインスクリプト・スタイルは高
    if (violation.violatedDirective === 'script-src' && violation.blockedUri === 'inline') {
      return 'high';
    }
    
    if (violation.violatedDirective === 'style-src' && violation.blockedUri === 'inline') {
      return 'high';
    }
    
    // 外部リソース読み込み関連は中
    if (violation.violatedDirective.includes('connect-src') || 
        violation.violatedDirective.includes('img-src')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * 推奨アクションの生成
   */
  private getRecommendedAction(violation: CSPViolation): string {
    if (violation.blockedUri === 'eval') {
      return 'eval()の使用を避け、安全な代替手段を検討してください';
    }
    
    if (violation.blockedUri === 'inline' && violation.violatedDirective === 'script-src') {
      return 'インラインスクリプトを外部ファイルに移動するか、nonceを使用してください';
    }
    
    if (violation.blockedUri === 'inline' && violation.violatedDirective === 'style-src') {
      return 'インラインスタイルをCSSファイルに移動するか、CSS変数を使用してください';
    }
    
    if (violation.violatedDirective.includes('connect-src')) {
      return `外部接続先 ${violation.blockedUri} をCSPに明示的に追加してください`;
    }
    
    if (violation.violatedDirective.includes('img-src')) {
      return `画像ソース ${violation.blockedUri} をCSPに明示的に追加してください`;
    }
    
    return `${violation.violatedDirective} に ${violation.blockedUri} を追加することを検討してください`;
  }

  /**
   * アラート判定
   */
  shouldAlert(violation: CSPViolation): boolean {
    const criticality = this.assessCriticality(violation);
    
    // クリティカル・高は即座にアラート
    if (criticality === 'critical' || criticality === 'high') {
      return true;
    }
    
    // 同じ種類の違反が短時間で多発している場合
    const recentSimilar = this.violations.filter(v => {
      const timeDiff = new Date(violation.timestamp).getTime() - new Date(v.timestamp).getTime();
      return Math.abs(timeDiff) < 10 * 60 * 1000 && // 10分以内
             v.violatedDirective === violation.violatedDirective &&
             v.effectiveDirective === violation.effectiveDirective;
    });
    
    return recentSimilar.length >= 5; // 10分で5回以上の同種違反
  }
}

// グローバルアナライザーインスタンス
export const cspAnalyzer = new CSPAnalyzer();