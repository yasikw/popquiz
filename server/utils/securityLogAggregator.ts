/**
 * セキュリティログ集約・分析エンジン
 * ダッシュボード用のメトリクス計算と統計処理
 */

import fs from 'fs';
import path from 'path';
import { EnhancedSecurityLogEntry, EnhancedSecurityEventType, EnhancedSecurityLogLevel } from './enhancedSecurityLogger';

// ダッシュボードメトリクス
export interface SecurityDashboardMetrics {
  overview: {
    totalEvents: number;
    criticalEvents: number;
    alertsTriggered: number;
    uniqueThreats: number;
    affectedUsers: number;
    timeRange: string;
  };
  eventDistribution: {
    byType: Record<string, number>;
    byLevel: Record<string, number>;
    byHour: Array<{ hour: string; count: number }>;
    byDay: Array<{ date: string; count: number; severity: string }>;
  };
  threatIntelligence: {
    topAttackSources: Array<{ ipAddress: string; count: number; severity: string; lastSeen: string }>;
    attackPatterns: Array<{ pattern: string; frequency: number; riskLevel: string }>;
    geographicDistribution: Array<{ country: string; region: string; threatCount: number }>;
  };
  systemHealth: {
    logIngestionRate: number;
    processingLatency: number;
    storageUtilization: number;
    alertResponseTime: number;
  };
  trendsAnalysis: {
    weekOverWeek: {
      eventsChange: number;
      threatsChange: number;
      alertsChange: number;
    };
    riskScore: number; // 0-100
    predictions: Array<{ metric: string; trend: 'increasing' | 'decreasing' | 'stable'; confidence: number }>;
  };
}

// 時系列データポイント
interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

// 地理的データ
interface GeographicThreat {
  country: string;
  region: string;
  city?: string;
  ipAddress: string;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  eventCount: number;
  lastActivity: Date;
}

// 攻撃パターン
interface AttackPattern {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  frequency: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  firstSeen: Date;
  lastSeen: Date;
  targets: string[]; // endpoints, user types, etc.
}

/**
 * ログデータ処理エンジン
 */
class LogDataProcessor {
  /**
   * 時間範囲内のログエントリを読み込み
   */
  async loadLogEntries(timeRangeHours: number = 24): Promise<EnhancedSecurityLogEntry[]> {
    const logDirectory = path.join(process.cwd(), 'logs', 'security');
    const cutoffTime = Date.now() - (timeRangeHours * 60 * 60 * 1000);
    const entries: EnhancedSecurityLogEntry[] = [];

    try {
      if (!fs.existsSync(logDirectory)) {
        return entries;
      }

      const logFiles = fs.readdirSync(logDirectory)
        .filter(file => file.startsWith('enhanced-security.log'))
        .sort()
        .reverse(); // 最新ファイルから処理

      for (const file of logFiles) {
        const filePath = path.join(logDirectory, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry: EnhancedSecurityLogEntry = JSON.parse(line);
            const entryTime = new Date(entry.timestamp).getTime();

            if (entryTime >= cutoffTime) {
              entries.push(entry);
            }
          } catch (parseError) {
            // 無効なJSON行をスキップ
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Error loading log entries:', error);
    }

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * IPアドレスの地理的情報を取得（モック実装）
   */
  async getGeographicInfo(ipAddress: string): Promise<{ country: string; region: string; city?: string } | null> {
    // 実際の実装では、GeoIPサービス（MaxMind、IPinfo等）を使用
    const mockData: Record<string, any> = {
      '192.168.1.1': { country: 'Private', region: 'LAN', city: 'Local' },
      '127.0.0.1': { country: 'Localhost', region: 'Local', city: 'Local' },
      // 実際のパブリックIPに対してはGeoIPサービスを呼び出し
    };

    return mockData[ipAddress] || { country: 'Unknown', region: 'Unknown' };
  }

  /**
   * ログエントリを時系列データに変換
   */
  convertToTimeSeries(entries: EnhancedSecurityLogEntry[], intervalMinutes: number = 60): TimeSeriesPoint[] {
    const intervals = new Map<number, number>();
    const intervalMs = intervalMinutes * 60 * 1000;

    for (const entry of entries) {
      const timestamp = new Date(entry.timestamp).getTime();
      const intervalKey = Math.floor(timestamp / intervalMs) * intervalMs;
      
      intervals.set(intervalKey, (intervals.get(intervalKey) || 0) + 1);
    }

    return Array.from(intervals.entries())
      .map(([timestamp, value]) => ({ timestamp, value }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

/**
 * メトリクス計算エンジン
 */
class MetricsCalculator {
  /**
   * 概要メトリクスの計算
   */
  calculateOverviewMetrics(entries: EnhancedSecurityLogEntry[], timeRangeHours: number): SecurityDashboardMetrics['overview'] {
    const criticalEvents = entries.filter(e => e.level === EnhancedSecurityLogLevel.CRITICAL).length;
    const alertsTriggered = entries.filter(e => e.eventType === 'SUSPICIOUS_TRAFFIC' as any).length;
    const uniqueThreats = new Set(entries.map(e => e.context.ipAddress).filter(Boolean)).size;
    const affectedUsers = new Set(entries.map(e => e.context.userId).filter(Boolean)).size;

    return {
      totalEvents: entries.length,
      criticalEvents,
      alertsTriggered,
      uniqueThreats,
      affectedUsers,
      timeRange: `${timeRangeHours}h`
    };
  }

  /**
   * イベント分布の計算
   */
  calculateEventDistribution(entries: EnhancedSecurityLogEntry[]): SecurityDashboardMetrics['eventDistribution'] {
    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    const byHour: Map<string, number> = new Map();
    const byDay: Map<string, { count: number; severitySum: number }> = new Map();

    for (const entry of entries) {
      // イベントタイプ別
      byType[entry.eventType] = (byType[entry.eventType] || 0) + 1;

      // レベル別
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;

      // 時間別
      const hour = new Date(entry.timestamp).toISOString().substring(0, 13);
      byHour.set(hour, (byHour.get(hour) || 0) + 1);

      // 日別（重要度を考慮）
      const date = new Date(entry.timestamp).toISOString().substring(0, 10);
      const existing = byDay.get(date) || { count: 0, severitySum: 0 };
      const severityWeight = {
        [EnhancedSecurityLogLevel.DEBUG]: 1,
        [EnhancedSecurityLogLevel.INFO]: 2,
        [EnhancedSecurityLogLevel.WARNING]: 3,
        [EnhancedSecurityLogLevel.ERROR]: 4,
        [EnhancedSecurityLogLevel.CRITICAL]: 5,
        [EnhancedSecurityLogLevel.EMERGENCY]: 6
      }[entry.level] || 1;

      byDay.set(date, {
        count: existing.count + 1,
        severitySum: existing.severitySum + severityWeight
      });
    }

    return {
      byType,
      byLevel,
      byHour: Array.from(byHour.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      byDay: Array.from(byDay.entries())
        .map(([date, data]) => ({
          date,
          count: data.count,
          severity: data.severitySum > data.count * 3 ? 'high' : data.severitySum > data.count * 2 ? 'medium' : 'low'
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * 脅威インテリジェンスの計算
   */
  async calculateThreatIntelligence(entries: EnhancedSecurityLogEntry[], processor: LogDataProcessor): Promise<SecurityDashboardMetrics['threatIntelligence']> {
    const ipCounts = new Map<string, { count: number; severity: string; lastSeen: string }>();
    const attackPatterns = new Map<string, number>();

    // IP別の集計
    for (const entry of entries) {
      if (entry.context.ipAddress) {
        const existing = ipCounts.get(entry.context.ipAddress) || { count: 0, severity: 'low', lastSeen: entry.timestamp };
        const currentSeverity = this.getSeverityScore(entry.level);
        const maxSeverity = Math.max(this.getSeverityScore(existing.severity as any), currentSeverity);

        ipCounts.set(entry.context.ipAddress, {
          count: existing.count + 1,
          severity: this.getSeverityLevel(maxSeverity),
          lastSeen: entry.timestamp > existing.lastSeen ? entry.timestamp : existing.lastSeen
        });
      }

      // 攻撃パターンの検出
      const pattern = this.identifyAttackPattern(entry);
      if (pattern) {
        attackPatterns.set(pattern, (attackPatterns.get(pattern) || 0) + 1);
      }
    }

    // 上位攻撃元の抽出
    const topAttackSources = Array.from(ipCounts.entries())
      .map(([ipAddress, data]) => ({ ipAddress, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 攻撃パターンの分析
    const sortedPatterns = Array.from(attackPatterns.entries())
      .map(([pattern, frequency]) => ({
        pattern,
        frequency,
        riskLevel: frequency > 10 ? 'high' : frequency > 5 ? 'medium' : 'low'
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // 地理的分布（モック実装）
    const geographicDistribution = [
      { country: 'Unknown', region: 'Unknown', threatCount: topAttackSources.length }
    ];

    return {
      topAttackSources,
      attackPatterns: sortedPatterns,
      geographicDistribution
    };
  }

  private getSeverityScore(level: EnhancedSecurityLogLevel | string): number {
    const scores = {
      [EnhancedSecurityLogLevel.DEBUG]: 1,
      [EnhancedSecurityLogLevel.INFO]: 2,
      [EnhancedSecurityLogLevel.WARNING]: 3,
      [EnhancedSecurityLogLevel.ERROR]: 4,
      [EnhancedSecurityLogLevel.CRITICAL]: 5,
      [EnhancedSecurityLogLevel.EMERGENCY]: 6,
      'low': 2,
      'medium': 3,
      'high': 4,
      'critical': 5
    };
    return scores[level as keyof typeof scores] || 1;
  }

  private getSeverityLevel(score: number): string {
    if (score >= 5) return 'critical';
    if (score >= 4) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  private identifyAttackPattern(entry: EnhancedSecurityLogEntry): string | null {
    const patterns = {
      'SQL Injection': /sql|union|select|drop|delete|insert|update/i,
      'XSS Attack': /<script|javascript:|vbscript:|onload|onerror/i,
      'Path Traversal': /\.\.|%2e%2e|\/etc\/|\/windows\//i,
      'Brute Force': entry.eventType === EnhancedSecurityEventType.AUTH_FAILURE ? 'Brute Force' : null,
      'Suspicious User Agent': /bot|crawler|spider|scan|hack/i.test(entry.context.userAgent || '') ? 'Bot Activity' : null
    };

    const content = JSON.stringify(entry).toLowerCase();
    
    for (const [patternName, regex] of Object.entries(patterns)) {
      if (regex === null) continue;
      if (typeof regex === 'string') return regex;
      if (regex instanceof RegExp && regex.test(content)) {
        return patternName;
      }
    }

    return null;
  }

  /**
   * システムヘルスメトリクスの計算
   */
  calculateSystemHealth(entries: EnhancedSecurityLogEntry[]): SecurityDashboardMetrics['systemHealth'] {
    const now = Date.now();
    const recentEntries = entries.filter(e => now - new Date(e.timestamp).getTime() < 60 * 60 * 1000); // 過去1時間

    // ログ取り込み率（時間あたりのイベント数）
    const logIngestionRate = recentEntries.length;

    // 処理遅延（モック計算）
    const processingLatency = Math.random() * 100 + 50; // 50-150ms

    // ストレージ使用率の計算
    const storageUtilization = this.calculateStorageUtilization();

    // アラート応答時間（モック）
    const alertResponseTime = Math.random() * 5000 + 1000; // 1-6秒

    return {
      logIngestionRate,
      processingLatency,
      storageUtilization,
      alertResponseTime
    };
  }

  private calculateStorageUtilization(): number {
    try {
      const logDirectory = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDirectory)) return 0;

      let totalSize = 0;
      const files = fs.readdirSync(logDirectory, { recursive: true });
      
      for (const file of files) {
        const filePath = path.join(logDirectory, file.toString());
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
          }
        } catch (error) {
          // ファイルアクセスエラーは無視
        }
      }

      // 最大1GBと仮定して使用率を計算
      const maxStorage = 1024 * 1024 * 1024; // 1GB
      return Math.min((totalSize / maxStorage) * 100, 100);
    } catch (error) {
      return 0;
    }
  }

  /**
   * トレンド分析の計算
   */
  calculateTrendsAnalysis(currentEntries: EnhancedSecurityLogEntry[], previousEntries: EnhancedSecurityLogEntry[]): SecurityDashboardMetrics['trendsAnalysis'] {
    const currentCount = currentEntries.length;
    const previousCount = previousEntries.length;
    
    const currentThreats = new Set(currentEntries.map(e => e.context.ipAddress).filter(Boolean)).size;
    const previousThreats = new Set(previousEntries.map(e => e.context.ipAddress).filter(Boolean)).size;
    
    const currentAlerts = currentEntries.filter(e => e.level === EnhancedSecurityLogLevel.CRITICAL).length;
    const previousAlerts = previousEntries.filter(e => e.level === EnhancedSecurityLogLevel.CRITICAL).length;

    const eventsChange = previousCount > 0 ? ((currentCount - previousCount) / previousCount) * 100 : 0;
    const threatsChange = previousThreats > 0 ? ((currentThreats - previousThreats) / previousThreats) * 100 : 0;
    const alertsChange = previousAlerts > 0 ? ((currentAlerts - previousAlerts) / previousAlerts) * 100 : 0;

    // リスクスコア計算（重要度、頻度、多様性を考慮）
    const riskScore = this.calculateRiskScore(currentEntries);

    // 予測（簡単なトレンド分析）
    const predictions = [
      {
        metric: 'events',
        trend: eventsChange > 10 ? 'increasing' as const : eventsChange < -10 ? 'decreasing' as const : 'stable' as const,
        confidence: Math.min(Math.abs(eventsChange) * 2, 95)
      },
      {
        metric: 'threats',
        trend: threatsChange > 20 ? 'increasing' as const : threatsChange < -20 ? 'decreasing' as const : 'stable' as const,
        confidence: Math.min(Math.abs(threatsChange) * 1.5, 90)
      }
    ];

    return {
      weekOverWeek: {
        eventsChange,
        threatsChange,
        alertsChange
      },
      riskScore,
      predictions
    };
  }

  private calculateRiskScore(entries: EnhancedSecurityLogEntry[]): number {
    if (entries.length === 0) return 0;

    let score = 0;
    const weights = {
      [EnhancedSecurityLogLevel.DEBUG]: 1,
      [EnhancedSecurityLogLevel.INFO]: 2,
      [EnhancedSecurityLogLevel.WARNING]: 5,
      [EnhancedSecurityLogLevel.ERROR]: 10,
      [EnhancedSecurityLogLevel.CRITICAL]: 20,
      [EnhancedSecurityLogLevel.EMERGENCY]: 30
    };

    // 重要度による重み付けスコア
    for (const entry of entries) {
      score += weights[entry.level] || 1;
    }

    // 正規化（0-100）
    const maxPossibleScore = entries.length * weights[EnhancedSecurityLogLevel.EMERGENCY];
    const normalizedScore = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;

    return Math.min(Math.round(normalizedScore), 100);
  }
}

/**
 * メインのログ集約システム
 */
export class SecurityLogAggregator {
  private processor: LogDataProcessor;
  private calculator: MetricsCalculator;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();

  constructor() {
    this.processor = new LogDataProcessor();
    this.calculator = new MetricsCalculator();
    this.setupCacheCleanup();
  }

  private setupCacheCleanup(): void {
    // 5分ごとにキャッシュをクリーンアップ
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > value.ttl) {
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  private getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCache(key: string, data: any, ttlMs: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  /**
   * ダッシュボードメトリクスの生成
   */
  async generateDashboardMetrics(timeRangeHours: number = 24): Promise<SecurityDashboardMetrics> {
    const cacheKey = `dashboard_metrics_${timeRangeHours}h`;
    const cached = this.getCached<SecurityDashboardMetrics>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 現在の期間のログ
      const currentEntries = await this.processor.loadLogEntries(timeRangeHours);
      
      // 比較用の前期間のログ
      const previousTimeStart = timeRangeHours * 2;
      const previousTimeEnd = timeRangeHours;
      const allEntries = await this.processor.loadLogEntries(previousTimeStart);
      const previousEntries = allEntries.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        const cutoffTime = Date.now() - (previousTimeEnd * 60 * 60 * 1000);
        return entryTime < cutoffTime;
      });

      const metrics: SecurityDashboardMetrics = {
        overview: this.calculator.calculateOverviewMetrics(currentEntries, timeRangeHours),
        eventDistribution: this.calculator.calculateEventDistribution(currentEntries),
        threatIntelligence: await this.calculator.calculateThreatIntelligence(currentEntries, this.processor),
        systemHealth: this.calculator.calculateSystemHealth(currentEntries),
        trendsAnalysis: this.calculator.calculateTrendsAnalysis(currentEntries, previousEntries)
      };

      // 結果をキャッシュ（5分間）
      this.setCache(cacheKey, metrics, 5 * 60 * 1000);

      return metrics;
    } catch (error) {
      console.error('Error generating dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * 時系列データの取得
   */
  async getTimeSeriesData(
    metric: 'events' | 'threats' | 'alerts',
    timeRangeHours: number = 24,
    intervalMinutes: number = 60
  ): Promise<TimeSeriesPoint[]> {
    const cacheKey = `timeseries_${metric}_${timeRangeHours}h_${intervalMinutes}m`;
    const cached = this.getCached<TimeSeriesPoint[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const entries = await this.processor.loadLogEntries(timeRangeHours);
      
      let filteredEntries = entries;
      if (metric === 'threats') {
        filteredEntries = entries.filter(e => 
          e.level === EnhancedSecurityLogLevel.WARNING || 
          e.level === EnhancedSecurityLogLevel.ERROR || 
          e.level === EnhancedSecurityLogLevel.CRITICAL
        );
      } else if (metric === 'alerts') {
        filteredEntries = entries.filter(e => e.level === EnhancedSecurityLogLevel.CRITICAL);
      }

      const timeSeries = this.processor.convertToTimeSeries(filteredEntries, intervalMinutes);
      
      // 結果をキャッシュ（2分間）
      this.setCache(cacheKey, timeSeries, 2 * 60 * 1000);

      return timeSeries;
    } catch (error) {
      console.error('Error generating time series data:', error);
      return [];
    }
  }

  /**
   * リアルタイム統計の取得
   */
  async getRealTimeStats(): Promise<{
    eventsLastHour: number;
    activeThreats: number;
    criticalAlerts: number;
    systemStatus: 'healthy' | 'warning' | 'critical';
  }> {
    const cacheKey = 'realtime_stats';
    const cached = this.getCached<any>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const entries = await this.processor.loadLogEntries(1); // 過去1時間

      const eventsLastHour = entries.length;
      const activeThreats = new Set(entries.map(e => e.context.ipAddress).filter(Boolean)).size;
      const criticalAlerts = entries.filter(e => e.level === EnhancedSecurityLogLevel.CRITICAL).length;

      let systemStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (criticalAlerts > 0 || activeThreats > 5) {
        systemStatus = 'critical';
      } else if (eventsLastHour > 100 || activeThreats > 2) {
        systemStatus = 'warning';
      }

      const stats = {
        eventsLastHour,
        activeThreats,
        criticalAlerts,
        systemStatus
      };

      // 30秒間キャッシュ
      this.setCache(cacheKey, stats, 30 * 1000);

      return stats;
    } catch (error) {
      console.error('Error getting real-time stats:', error);
      return {
        eventsLastHour: 0,
        activeThreats: 0,
        criticalAlerts: 0,
        systemStatus: 'healthy'
      };
    }
  }
}

// シングルトンインスタンス
export const securityLogAggregator = new SecurityLogAggregator();