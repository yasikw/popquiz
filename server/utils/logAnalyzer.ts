import fs from 'fs';
import path from 'path';
import { securityLogger } from './securityLogger';

// ログ分析とダッシュボード機能
export class LogAnalyzer {
  private logDirectory: string;

  constructor() {
    this.logDirectory = path.join(process.cwd(), 'logs');
  }

  // セキュリティログの統計情報を取得
  public async getSecurityStats(timeRange: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByLevel: Record<string, number>;
    topIpAddresses: Array<{ ip: string; count: number }>;
    authFailures: number;
    suspiciousActivities: number;
    alertCount: number;
    timeRange: string;
  }> {
    try {
      const logFile = path.join(this.logDirectory, 'security.log');
      if (!fs.existsSync(logFile)) {
        return this.getEmptyStats(timeRange);
      }

      const logContent = fs.readFileSync(logFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.trim());
      
      const now = Date.now();
      const timeRangeMs = this.getTimeRangeMs(timeRange);
      const cutoffTime = now - timeRangeMs;

      const eventsByType: Record<string, number> = {};
      const eventsByLevel: Record<string, number> = {};
      const ipCounts: Record<string, number> = {};
      let authFailures = 0;
      let suspiciousActivities = 0;
      let alertCount = 0;
      let totalEvents = 0;

      for (const line of lines) {
        try {
          const logEntry = JSON.parse(line);
          const eventTime = new Date(logEntry.timestamp).getTime();
          
          // 時間範囲内のイベントのみを処理
          if (eventTime >= cutoffTime) {
            totalEvents++;
            
            // イベントタイプ別集計
            eventsByType[logEntry.eventType] = (eventsByType[logEntry.eventType] || 0) + 1;
            
            // レベル別集計
            eventsByLevel[logEntry.level] = (eventsByLevel[logEntry.level] || 0) + 1;
            
            // IP別集計
            if (logEntry.ipAddress) {
              ipCounts[logEntry.ipAddress] = (ipCounts[logEntry.ipAddress] || 0) + 1;
            }
            
            // 特定イベントのカウント
            if (logEntry.eventType === 'auth_failure') {
              authFailures++;
            }
            if (logEntry.eventType === 'suspicious_activity') {
              suspiciousActivities++;
            }
            if (logEntry.level === 'critical') {
              alertCount++;
            }
          }
        } catch (parseError) {
          // 無効なJSON行はスキップ
          continue;
        }
      }

      // IPアドレスを使用頻度順にソート
      const topIpAddresses = Object.entries(ipCounts)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalEvents,
        eventsByType,
        eventsByLevel,
        topIpAddresses,
        authFailures,
        suspiciousActivities,
        alertCount,
        timeRange
      };
    } catch (error) {
      console.error('Error analyzing security logs:', error);
      return this.getEmptyStats(timeRange);
    }
  }

  private getTimeRangeMs(timeRange: 'hour' | 'day' | 'week'): number {
    switch (timeRange) {
      case 'hour': return 60 * 60 * 1000;
      case 'day': return 24 * 60 * 60 * 1000;
      case 'week': return 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000;
    }
  }

  private getEmptyStats(timeRange: string) {
    return {
      totalEvents: 0,
      eventsByType: {},
      eventsByLevel: {},
      topIpAddresses: [],
      authFailures: 0,
      suspiciousActivities: 0,
      alertCount: 0,
      timeRange
    };
  }

  // 最近のアラートを取得
  public async getRecentAlerts(limit: number = 50): Promise<Array<{
    timestamp: string;
    level: string;
    eventType: string;
    message: string;
    userId?: string;
    ipAddress?: string;
    metadata?: any;
  }>> {
    try {
      const logFile = path.join(this.logDirectory, 'security.log');
      if (!fs.existsSync(logFile)) {
        return [];
      }

      const logContent = fs.readFileSync(logFile, 'utf8');
      const lines = logContent.trim().split('\n').filter(line => line.trim());
      
      const alerts = [];
      
      // ログを逆順で読む（最新から）
      for (let i = lines.length - 1; i >= 0 && alerts.length < limit; i--) {
        try {
          const logEntry = JSON.parse(lines[i]);
          
          // 警告以上のレベルまたは特定のイベントタイプのみ
          if (logEntry.level === 'warning' || 
              logEntry.level === 'error' || 
              logEntry.level === 'critical' ||
              logEntry.eventType === 'suspicious_activity') {
            alerts.push({
              timestamp: logEntry.timestamp,
              level: logEntry.level,
              eventType: logEntry.eventType,
              message: logEntry.message,
              userId: logEntry.userId,
              ipAddress: logEntry.ipAddress,
              metadata: logEntry.metadata
            });
          }
        } catch (parseError) {
          continue;
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error getting recent alerts:', error);
      return [];
    }
  }

  // ログファイルの健全性チェック
  public async checkLogHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
    logStats: {
      totalSize: number;
      fileCount: number;
      lastModified?: Date;
    };
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const logStats = securityLogger.getLogStats();
      
      // ログファイルサイズのチェック
      if (logStats.totalSize > 50 * 1024 * 1024) { // 50MB
        issues.push('ログファイルが大きすぎます (50MB以上)');
        recommendations.push('ログローテーションの頻度を上げることを検討してください');
      }

      // ログファイル数のチェック
      if (logStats.fileCount > 10) {
        recommendations.push('古いログファイルのアーカイブまたは削除を検討してください');
      }

      // 最後の更新時刻のチェック
      if (logStats.lastModified) {
        const hoursSinceUpdate = (Date.now() - logStats.lastModified.getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate > 2) {
          issues.push('ログファイルが2時間以上更新されていません');
          recommendations.push('ログシステムの動作状況を確認してください');
        }
      }

      // ディスク容量のチェック（簡易版）
      if (logStats.totalSize > 0) {
        const availableSpace = this.getAvailableDiskSpace();
        if (availableSpace !== null && logStats.totalSize > availableSpace * 0.1) {
          issues.push('ログファイルがディスク容量の10%以上を使用しています');
          recommendations.push('ディスク容量の監視とログファイルの管理を強化してください');
        }
      }

      return {
        isHealthy: issues.length === 0,
        issues,
        recommendations,
        logStats
      };
    } catch (error) {
      return {
        isHealthy: false,
        issues: ['ログ健全性チェック中にエラーが発生しました'],
        recommendations: ['ログシステムの設定を確認してください'],
        logStats: { totalSize: 0, fileCount: 0 }
      };
    }
  }

  private getAvailableDiskSpace(): number | null {
    try {
      const stats = fs.statSync(this.logDirectory);
      // 簡易的な実装 - 実際の空き容量の取得は環境依存
      return null;
    } catch (error) {
      return null;
    }
  }

  // 機密情報の漏洩チェック
  public async scanForSensitiveData(): Promise<{
    foundIssues: Array<{
      line: number;
      issue: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    recommendations: string[];
  }> {
    const foundIssues: Array<{ line: number; issue: string; severity: 'low' | 'medium' | 'high' }> = [];
    const recommendations: string[] = [];

    try {
      const logFile = path.join(this.logDirectory, 'security.log');
      if (!fs.existsSync(logFile)) {
        return { foundIssues, recommendations };
      }

      const logContent = fs.readFileSync(logFile, 'utf8');
      const lines = logContent.split('\n');

      const sensitivePatterns = [
        { pattern: /password["\s]*[:=]["\s]*[^"]+/i, severity: 'high' as const, desc: 'Password in logs' },
        { pattern: /token["\s]*[:=]["\s]*[^"]+/i, severity: 'high' as const, desc: 'Token in logs' },
        { pattern: /secret["\s]*[:=]["\s]*[^"]+/i, severity: 'high' as const, desc: 'Secret in logs' },
        { pattern: /api[_-]?key["\s]*[:=]["\s]*[^"]+/i, severity: 'high' as const, desc: 'API key in logs' },
        { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, severity: 'high' as const, desc: 'Credit card number pattern' },
        { pattern: /\b\d{3}-\d{2}-\d{4}\b/, severity: 'high' as const, desc: 'SSN pattern' },
        { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, severity: 'medium' as const, desc: 'Email address' },
        { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, severity: 'low' as const, desc: 'IP address (could be sensitive)' }
      ];

      lines.forEach((line, index) => {
        sensitivePatterns.forEach(({ pattern, severity, desc }) => {
          if (pattern.test(line) && !line.includes('[REDACTED]')) {
            foundIssues.push({
              line: index + 1,
              issue: desc,
              severity
            });
          }
        });
      });

      if (foundIssues.length > 0) {
        recommendations.push('機密情報がログに記録されています。ログ設定を見直してください。');
        recommendations.push('機密情報は [REDACTED] で置き換えるか、ログに記録しないようにしてください。');
      }

      return { foundIssues, recommendations };
    } catch (error) {
      return { 
        foundIssues: [{ line: 0, issue: 'ログスキャン中にエラーが発生しました', severity: 'medium' }], 
        recommendations: ['ログファイルの権限とアクセス性を確認してください'] 
      };
    }
  }
}

export const logAnalyzer = new LogAnalyzer();