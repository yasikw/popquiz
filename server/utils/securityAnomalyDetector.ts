/**
 * セキュリティ異常検知エンジン
 * 高度なパターン認識と機械学習ベースの異常検知
 */

import { EnhancedSecurityLogEntry, EnhancedSecurityEventType, enhancedSecurityLogger } from './enhancedSecurityLogger';
import { EventEmitter } from 'events';

// 異常検知メトリクス
interface AnomalyMetrics {
  requestRate: number;
  errorRate: number;
  uniqueIPs: number;
  authFailureRate: number;
  suspiciousUserAgents: number;
  geographicDispersion: number;
  timebasedAnomalies: number;
}

// 異常検知結果
interface AnomalyDetectionResult {
  isAnomalous: boolean;
  confidence: number; // 0-100
  anomalyType: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendedActions: string[];
  metadata: Record<string, any>;
}

// 時系列データポイント
interface TimeSeriesDataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * 統計ベースの異常検知
 */
class StatisticalAnomalyDetector {
  private readonly Z_SCORE_THRESHOLD = 2.5; // 標準偏差の閾値
  private readonly MIN_DATA_POINTS = 10; // 最小データポイント数

  /**
   * Z-scoreベースの異常検知
   */
  detectOutliers(dataPoints: number[]): { isOutlier: boolean; zScore: number; threshold: number } {
    if (dataPoints.length < this.MIN_DATA_POINTS) {
      return { isOutlier: false, zScore: 0, threshold: this.Z_SCORE_THRESHOLD };
    }

    const mean = dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length;
    const variance = dataPoints.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dataPoints.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return { isOutlier: false, zScore: 0, threshold: this.Z_SCORE_THRESHOLD };
    }

    const latestValue = dataPoints[dataPoints.length - 1];
    const zScore = Math.abs((latestValue - mean) / stdDev);

    return {
      isOutlier: zScore > this.Z_SCORE_THRESHOLD,
      zScore,
      threshold: this.Z_SCORE_THRESHOLD
    };
  }

  /**
   * 時系列データの異常検知
   */
  detectTimeSeriesAnomalies(timeSeries: TimeSeriesDataPoint[]): AnomalyDetectionResult[] {
    const results: AnomalyDetectionResult[] = [];

    if (timeSeries.length < this.MIN_DATA_POINTS) {
      return results;
    }

    // 移動平均による異常検知
    const windowSize = Math.min(10, Math.floor(timeSeries.length / 3));
    const values = timeSeries.map(point => point.value);

    for (let i = windowSize; i < values.length; i++) {
      const window = values.slice(i - windowSize, i);
      const outlierDetection = this.detectOutliers([...window, values[i]]);

      if (outlierDetection.isOutlier) {
        results.push({
          isAnomalous: true,
          confidence: Math.min(95, outlierDetection.zScore * 20),
          anomalyType: 'statistical_outlier',
          description: `Statistical anomaly detected (Z-score: ${outlierDetection.zScore.toFixed(2)})`,
          severity: outlierDetection.zScore > 4 ? 'critical' : 
                   outlierDetection.zScore > 3 ? 'high' : 'medium',
          recommendedActions: [
            'Investigate the cause of sudden metric change',
            'Review related security events',
            'Consider temporary rate limiting if traffic-related'
          ],
          metadata: {
            zScore: outlierDetection.zScore,
            timestamp: timeSeries[i].timestamp,
            value: values[i],
            windowMean: window.reduce((a, b) => a + b, 0) / window.length
          }
        });
      }
    }

    return results;
  }
}

/**
 * パターンベースの異常検知
 */
class PatternAnomalyDetector {
  private suspiciousPatterns = {
    userAgents: [
      /sqlmap/i, /nikto/i, /dirb/i, /nmap/i, /masscan/i, /burp/i,
      /python-requests/i, /curl.*bot/i, /scanner/i, /exploit/i
    ],
    paths: [
      /\/\.env/i, /\/config\./i, /\/admin/i, /\/wp-admin/i, /\/\.git/i,
      /\.\./,  /union.*select/i, /<script/i, /javascript:/i
    ],
    ipPatterns: [
      /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private IPs from external
      /^0\./, /^127\./, /^169\.254\./, /^224\./ // Invalid/reserved ranges
    ]
  };

  /**
   * 怪しいUser-Agentの検知
   */
  detectSuspiciousUserAgent(userAgent: string): AnomalyDetectionResult | null {
    for (const pattern of this.suspiciousPatterns.userAgents) {
      if (pattern.test(userAgent)) {
        return {
          isAnomalous: true,
          confidence: 95,
          anomalyType: 'suspicious_user_agent',
          description: `Suspicious User-Agent detected: ${userAgent.substring(0, 50)}...`,
          severity: 'high',
          recommendedActions: [
            'Block IP address if confirmed malicious',
            'Analyze request patterns from this source',
            'Review security logs for related activity'
          ],
          metadata: {
            userAgent,
            matchedPattern: pattern.source
          }
        };
      }
    }
    return null;
  }

  /**
   * 怪しいパスパターンの検知
   */
  detectSuspiciousPath(path: string): AnomalyDetectionResult | null {
    for (const pattern of this.suspiciousPatterns.paths) {
      if (pattern.test(path)) {
        return {
          isAnomalous: true,
          confidence: 90,
          anomalyType: 'suspicious_path',
          description: `Suspicious path access detected: ${path}`,
          severity: 'medium',
          recommendedActions: [
            'Monitor continued access attempts',
            'Verify path accessibility and permissions',
            'Consider implementing path-based blocking'
          ],
          metadata: {
            path,
            matchedPattern: pattern.source
          }
        };
      }
    }
    return null;
  }

  /**
   * 地理的異常の検知
   */
  detectGeographicAnomaly(userId: string, currentLocation: string, historicalLocations: string[]): AnomalyDetectionResult | null {
    if (historicalLocations.length < 3) {
      return null; // 十分な履歴データがない
    }

    // 現在の場所が過去の場所と大きく異なるかチェック
    const isUnusualLocation = !historicalLocations.includes(currentLocation);
    
    if (isUnusualLocation) {
      return {
        isAnomalous: true,
        confidence: 75,
        anomalyType: 'geographic_anomaly',
        description: `Unusual login location detected for user ${userId}`,
        severity: 'medium',
        recommendedActions: [
          'Require additional authentication',
          'Send notification to user',
          'Monitor for account compromise indicators'
        ],
        metadata: {
          userId,
          currentLocation,
          historicalLocations: historicalLocations.slice(-5) // 最新5件のみ
        }
      };
    }

    return null;
  }
}

/**
 * 行動ベースの異常検知
 */
class BehavioralAnomalyDetector {
  private readonly RAPID_REQUESTS_THRESHOLD = 50; // 1分間のリクエスト数
  private readonly CONCURRENT_SESSIONS_THRESHOLD = 3; // 同時セッション数

  /**
   * 異常な頻度のリクエストを検知
   */
  detectRapidRequests(ipAddress: string, requestTimes: number[]): AnomalyDetectionResult | null {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    
    const recentRequests = requestTimes.filter(time => time > oneMinuteAgo);
    
    if (recentRequests.length > this.RAPID_REQUESTS_THRESHOLD) {
      return {
        isAnomalous: true,
        confidence: 95,
        anomalyType: 'rapid_requests',
        description: `Excessive request rate detected from ${ipAddress}`,
        severity: 'high',
        recommendedActions: [
          'Implement rate limiting',
          'Consider temporary IP blocking',
          'Analyze request patterns for bot behavior'
        ],
        metadata: {
          ipAddress,
          requestCount: recentRequests.length,
          timeWindow: '1 minute',
          threshold: this.RAPID_REQUESTS_THRESHOLD
        }
      };
    }

    return null;
  }

  /**
   * 異常なセッション行動を検知
   */
  detectAbnormalSessionBehavior(userId: string, activeSessions: number, sessionDuration: number): AnomalyDetectionResult | null {
    const results: AnomalyDetectionResult[] = [];

    // 同時セッション数の異常
    if (activeSessions > this.CONCURRENT_SESSIONS_THRESHOLD) {
      results.push({
        isAnomalous: true,
        confidence: 80,
        anomalyType: 'concurrent_sessions',
        description: `Unusual number of concurrent sessions for user ${userId}`,
        severity: 'medium',
        recommendedActions: [
          'Verify user identity',
          'Consider terminating older sessions',
          'Monitor for account sharing or compromise'
        ],
        metadata: {
          userId,
          activeSessions,
          threshold: this.CONCURRENT_SESSIONS_THRESHOLD
        }
      });
    }

    // 異常に短いセッション（ボット的行動）
    if (sessionDuration < 30 * 1000 && sessionDuration > 0) { // 30秒未満
      results.push({
        isAnomalous: true,
        confidence: 60,
        anomalyType: 'short_session',
        description: `Unusually short session duration detected`,
        severity: 'low',
        recommendedActions: [
          'Monitor for automated behavior',
          'Consider implementing CAPTCHA',
          'Analyze user interaction patterns'
        ],
        metadata: {
          userId,
          sessionDuration,
          minimumExpected: 30000
        }
      });
    }

    return results.length > 0 ? results[0] : null;
  }
}

/**
 * メインの異常検知エンジン
 */
export class SecurityAnomalyDetector extends EventEmitter {
  private statisticalDetector: StatisticalAnomalyDetector;
  private patternDetector: PatternAnomalyDetector;
  private behavioralDetector: BehavioralAnomalyDetector;
  
  private metricsHistory: Map<string, TimeSeriesDataPoint[]> = new Map();
  private requestHistory: Map<string, number[]> = new Map();
  private userLocationHistory: Map<string, string[]> = new Map();

  constructor() {
    super();
    this.statisticalDetector = new StatisticalAnomalyDetector();
    this.patternDetector = new PatternAnomalyDetector();
    this.behavioralDetector = new BehavioralAnomalyDetector();
    
    this.setupMetricsCollection();
  }

  private setupMetricsCollection(): void {
    // 定期的にメトリクスを収集（5分間隔）
    setInterval(() => {
      this.collectCurrentMetrics();
    }, 5 * 60 * 1000);
  }

  private collectCurrentMetrics(): void {
    const now = Date.now();
    
    // 現在のメトリクスを計算（実装では実際のデータソースから取得）
    const metrics = this.calculateCurrentMetrics();
    
    // 各メトリクスを時系列データとして保存
    Object.entries(metrics).forEach(([metricName, value]) => {
      const history = this.metricsHistory.get(metricName) || [];
      history.push({ timestamp: now, value });
      
      // 24時間分のデータのみ保持
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const filteredHistory = history.filter(point => point.timestamp > oneDayAgo);
      
      this.metricsHistory.set(metricName, filteredHistory);
    });
  }

  private calculateCurrentMetrics(): AnomalyMetrics {
    // 実際の実装では、データベースやログファイルから現在のメトリクスを計算
    return {
      requestRate: 0,
      errorRate: 0,
      uniqueIPs: 0,
      authFailureRate: 0,
      suspiciousUserAgents: 0,
      geographicDispersion: 0,
      timebasedAnomalies: 0
    };
  }

  /**
   * セキュリティログエントリの異常検知
   */
  public async analyzeLogEntry(entry: EnhancedSecurityLogEntry): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];

    try {
      // パターンベースの検知
      if (entry.context.userAgent) {
        const userAgentAnomaly = this.patternDetector.detectSuspiciousUserAgent(entry.context.userAgent);
        if (userAgentAnomaly) {
          results.push(userAgentAnomaly);
        }
      }

      if (entry.context.endpoint) {
        const pathAnomaly = this.patternDetector.detectSuspiciousPath(entry.context.endpoint);
        if (pathAnomaly) {
          results.push(pathAnomaly);
        }
      }

      // 行動ベースの検知
      if (entry.context.ipAddress) {
        this.updateRequestHistory(entry.context.ipAddress);
        const requestHistory = this.requestHistory.get(entry.context.ipAddress) || [];
        const rapidRequestsAnomaly = this.behavioralDetector.detectRapidRequests(entry.context.ipAddress, requestHistory);
        if (rapidRequestsAnomaly) {
          results.push(rapidRequestsAnomaly);
        }
      }

      // 地理的異常検知（位置データが利用可能な場合）
      if (entry.context.userId && entry.context.geography) {
        const locationHistory = this.userLocationHistory.get(entry.context.userId) || [];
        const currentLocation = `${entry.context.geography.country || 'unknown'}_${entry.context.geography.region || 'unknown'}`;
        const geoAnomaly = this.patternDetector.detectGeographicAnomaly(entry.context.userId, currentLocation, locationHistory);
        if (geoAnomaly) {
          results.push(geoAnomaly);
        }
        
        // 位置履歴を更新
        locationHistory.push(currentLocation);
        this.userLocationHistory.set(entry.context.userId, locationHistory.slice(-10)); // 最新10件のみ保持
      }

      // 結果があれば通知
      if (results.length > 0) {
        this.emit('anomaliesDetected', {
          entry,
          anomalies: results
        });

        // 重要度が高い異常があればログに記録
        const highSeverityAnomalies = results.filter(r => r.severity === 'high' || r.severity === 'critical');
        if (highSeverityAnomalies.length > 0) {
          enhancedSecurityLogger.logSuspiciousActivity(
            `Multiple anomalies detected: ${highSeverityAnomalies.map(a => a.anomalyType).join(', ')}`,
            entry.context.userId,
            entry.context.ipAddress,
            { anomalies: highSeverityAnomalies }
          );
        }
      }

    } catch (error) {
      console.error('Error in anomaly detection:', error);
    }

    return results;
  }

  private updateRequestHistory(ipAddress: string): void {
    const now = Date.now();
    const history = this.requestHistory.get(ipAddress) || [];
    history.push(now);
    
    // 過去1時間のデータのみ保持
    const oneHourAgo = now - 60 * 60 * 1000;
    const filteredHistory = history.filter(time => time > oneHourAgo);
    
    this.requestHistory.set(ipAddress, filteredHistory);
  }

  /**
   * 時系列メトリクスの異常検知
   */
  public async analyzeMetricsTrends(): Promise<AnomalyDetectionResult[]> {
    const results: AnomalyDetectionResult[] = [];

    for (const [metricName, timeSeries] of this.metricsHistory) {
      const anomalies = this.statisticalDetector.detectTimeSeriesAnomalies(timeSeries);
      results.push(...anomalies);
    }

    if (results.length > 0) {
      this.emit('metricsAnomaliesDetected', { anomalies: results });
    }

    return results;
  }

  /**
   * 現在の異常検知状況を取得
   */
  public getDetectionStatus(): {
    activeMonitors: number;
    recentAnomalies: number;
    metricsTracked: number;
    lastAnalysis: Date;
  } {
    return {
      activeMonitors: 3, // statistical, pattern, behavioral
      recentAnomalies: 0, // 実装では実際の数を計算
      metricsTracked: this.metricsHistory.size,
      lastAnalysis: new Date()
    };
  }
}

// シングルトンインスタンス
export const securityAnomalyDetector = new SecurityAnomalyDetector();