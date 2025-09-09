/**
 * 強化されたセキュリティログシステム
 * 詳細ログ、異常検知、リアルタイムアラート機能付き
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// 強化されたセキュリティログレベル
export enum EnhancedSecurityLogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

// 拡張されたセキュリティイベントタイプ
export enum EnhancedSecurityEventType {
  // 認証関連
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILURE = 'auth_failure',
  AUTH_MULTIPLE_FAILURES = 'auth_multiple_failures',
  AUTH_BRUTE_FORCE = 'auth_brute_force',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  
  // 権限・アクセス制御
  PERMISSION_DENIED = 'permission_denied',
  PRIVILEGE_ESCALATION_ATTEMPT = 'privilege_escalation_attempt',
  UNAUTHORIZED_API_ACCESS = 'unauthorized_api_access',
  ADMIN_ACCESS_ATTEMPT = 'admin_access_attempt',
  
  // ファイル・データ操作
  FILE_UPLOAD_ATTEMPT = 'file_upload_attempt',
  FILE_UPLOAD_REJECTED = 'file_upload_rejected',
  MALICIOUS_FILE_DETECTED = 'malicious_file_detected',
  DATA_EXFILTRATION_ATTEMPT = 'data_exfiltration_attempt',
  
  // ネットワーク・トラフィック
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DDOS_ATTEMPT = 'ddos_attempt',
  SUSPICIOUS_TRAFFIC = 'suspicious_traffic',
  ABNORMAL_TRAFFIC = 'abnormal_traffic',
  GEO_ANOMALY = 'geo_anomaly',
  
  // 攻撃パターン
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_VIOLATION = 'csrf_violation',
  PATH_TRAVERSAL_ATTEMPT = 'path_traversal_attempt',
  COMMAND_INJECTION_ATTEMPT = 'command_injection_attempt',
  
  // セッション・セキュリティ
  SESSION_HIJACK_ATTEMPT = 'session_hijack_attempt',
  SESSION_FIXATION_ATTEMPT = 'session_fixation_attempt',
  CONCURRENT_SESSION_VIOLATION = 'concurrent_session_violation',
  
  // 設定・システム
  CONFIGURATION_CHANGE = 'configuration_change',
  SECURITY_POLICY_VIOLATION = 'security_policy_violation',
  SYSTEM_INTEGRITY_CHECK = 'system_integrity_check',
  
  // 外部サービス
  API_QUOTA_EXCEEDED = 'api_quota_exceeded',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
  THIRD_PARTY_INTEGRATION_FAILURE = 'third_party_integration_failure'
}

// セキュリティコンテキスト
interface SecurityContext {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  geography?: {
    country?: string;
    region?: string;
    city?: string;
  };
  device?: {
    type?: string;
    platform?: string;
    browser?: string;
  };
  threat?: {
    level: 'low' | 'medium' | 'high' | 'critical';
    indicators: string[];
    confidence: number; // 0-100
  };
}

// 強化されたログエントリ
interface EnhancedSecurityLogEntry {
  id: string; // ユニークID
  timestamp: string;
  level: EnhancedSecurityLogLevel;
  eventType: EnhancedSecurityEventType;
  message: string;
  context: SecurityContext;
  metadata?: Record<string, any>;
  hash: string; // 改ざん検知
  correlationId?: string; // 関連イベントの追跡
  tags: string[]; // 検索・分類用タグ
}

// アラート設定
interface AlertConfiguration {
  eventType: EnhancedSecurityEventType;
  threshold: number;
  timeWindow: number; // ミリ秒
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownPeriod: number; // アラート間隔制御
}

// 異常検知パターン
interface AnomalyPattern {
  name: string;
  description: string;
  pattern: RegExp | ((entry: EnhancedSecurityLogEntry) => boolean);
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

/**
 * 強化されたセキュリティロガー
 */
export class EnhancedSecurityLogger extends EventEmitter {
  private logDirectory: string;
  private logFile: string;
  private maxLogSize: number = 50 * 1024 * 1024; // 50MB
  private maxLogFiles: number = 20;
  private alertConfigs: Map<EnhancedSecurityEventType, AlertConfiguration> = new Map();
  private eventCounts: Map<string, { count: number; firstSeen: number; lastSeen: number }> = new Map();
  private anomalyPatterns: AnomalyPattern[] = [];
  private recentAlerts: Map<string, number> = new Map(); // クールダウン管理

  constructor() {
    super();
    this.logDirectory = path.join(process.cwd(), 'logs', 'security');
    this.logFile = path.join(this.logDirectory, 'enhanced-security.log');
    this.initializeLogger();
    this.setupDefaultAlertConfigurations();
    this.setupAnomalyPatterns();
  }

  private initializeLogger(): void {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private setupDefaultAlertConfigurations(): void {
    const configs: Array<[EnhancedSecurityEventType, Partial<AlertConfiguration>]> = [
      [EnhancedSecurityEventType.AUTH_FAILURE, { threshold: 5, timeWindow: 15 * 60 * 1000, severity: 'medium' }],
      [EnhancedSecurityEventType.AUTH_BRUTE_FORCE, { threshold: 1, timeWindow: 5 * 60 * 1000, severity: 'critical' }],
      [EnhancedSecurityEventType.PRIVILEGE_ESCALATION_ATTEMPT, { threshold: 1, timeWindow: 60 * 1000, severity: 'critical' }],
      [EnhancedSecurityEventType.SQL_INJECTION_ATTEMPT, { threshold: 1, timeWindow: 5 * 60 * 1000, severity: 'high' }],
      [EnhancedSecurityEventType.XSS_ATTEMPT, { threshold: 3, timeWindow: 10 * 60 * 1000, severity: 'high' }],
      [EnhancedSecurityEventType.DDOS_ATTEMPT, { threshold: 1, timeWindow: 1 * 60 * 1000, severity: 'critical' }],
      [EnhancedSecurityEventType.MALICIOUS_FILE_DETECTED, { threshold: 1, timeWindow: 1 * 60 * 1000, severity: 'critical' }],
      [EnhancedSecurityEventType.SESSION_HIJACK_ATTEMPT, { threshold: 1, timeWindow: 5 * 60 * 1000, severity: 'critical' }],
    ];

    configs.forEach(([eventType, config]) => {
      this.alertConfigs.set(eventType, {
        eventType,
        threshold: config.threshold || 5,
        timeWindow: config.timeWindow || 60 * 60 * 1000,
        severity: config.severity || 'medium',
        enabled: true,
        cooldownPeriod: 5 * 60 * 1000, // 5分のクールダウン
        ...config
      });
    });
  }

  private setupAnomalyPatterns(): void {
    this.anomalyPatterns = [
      {
        name: 'Multiple Failed Logins from Same IP',
        description: 'Same IP address with multiple authentication failures',
        pattern: (entry) => {
          if (entry.eventType === EnhancedSecurityEventType.AUTH_FAILURE) {
            const key = `auth_fail_${entry.context.ipAddress}`;
            const now = Date.now();
            const existing = this.eventCounts.get(key);
            
            if (!existing) {
              this.eventCounts.set(key, { count: 1, firstSeen: now, lastSeen: now });
              return false;
            }
            
            existing.count++;
            existing.lastSeen = now;
            
            // 10分間で5回以上の失敗
            return existing.count >= 5 && (now - existing.firstSeen) <= 10 * 60 * 1000;
          }
          return false;
        },
        severity: 'high',
        enabled: true
      },
      {
        name: 'Rapid Sequential API Calls',
        description: 'Unusually rapid API calls from single source',
        pattern: (entry) => {
          if (entry.context.endpoint) {
            const key = `api_calls_${entry.context.ipAddress}_${entry.context.endpoint}`;
            const now = Date.now();
            const existing = this.eventCounts.get(key);
            
            if (!existing) {
              this.eventCounts.set(key, { count: 1, firstSeen: now, lastSeen: now });
              return false;
            }
            
            existing.count++;
            existing.lastSeen = now;
            
            // 1分間で50回以上のAPI呼び出し
            return existing.count >= 50 && (now - existing.firstSeen) <= 60 * 1000;
          }
          return false;
        },
        severity: 'medium',
        enabled: true
      },
      {
        name: 'Geographic Anomaly',
        description: 'Login from unusual geographic location',
        pattern: (entry) => {
          if (entry.eventType === EnhancedSecurityEventType.AUTH_SUCCESS && 
              entry.context.userId && entry.context.geography) {
            // 実装：ユーザーの通常の地理的パターンとの比較
            // 実際の実装では、ユーザーの過去のログイン地域を分析
            return false; // プレースホルダー
          }
          return false;
        },
        severity: 'medium',
        enabled: false // 地理的データが利用可能になったら有効化
      }
    ];
  }

  private generateLogId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateCorrelationId(): string {
    return crypto.randomBytes(12).toString('hex');
  }

  private generateLogHash(entry: Omit<EnhancedSecurityLogEntry, 'hash'>): string {
    const data = JSON.stringify(entry);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private sanitizeForLogging(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'authorization', 'cookie',
      'session', 'csrf', 'api_key', 'access_token', 'refresh_token',
      'private_key', 'credit_card', 'ssn', 'social_security', 'passport'
    ];

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // 再帰的にサニタイズ
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeForLogging(sanitized[key]);
      }
    }

    return sanitized;
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (!fs.existsSync(this.logFile)) {
        return;
      }

      const stats = fs.statSync(this.logFile);
      if (stats.size < this.maxLogSize) {
        return;
      }

      // タイムスタンプ付きでローテーション
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFile = `${this.logFile}.${timestamp}`;
      
      fs.renameSync(this.logFile, rotatedFile);

      // 古いファイルを削除（保持数を超えた場合）
      const logFiles = fs.readdirSync(this.logDirectory)
        .filter(file => file.startsWith('enhanced-security.log.'))
        .sort()
        .reverse();

      if (logFiles.length > this.maxLogFiles) {
        for (const file of logFiles.slice(this.maxLogFiles)) {
          fs.unlinkSync(path.join(this.logDirectory, file));
        }
      }
    } catch (error) {
      console.error('Enhanced log rotation failed:', error);
    }
  }

  private writeLogEntry(entry: EnhancedSecurityLogEntry): void {
    try {
      this.rotateLogsIfNeeded();
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write enhanced security log:', error);
    }
  }

  private checkAnomalyPatterns(entry: EnhancedSecurityLogEntry): void {
    for (const pattern of this.anomalyPatterns) {
      if (!pattern.enabled) continue;

      let isMatch = false;
      try {
        if (typeof pattern.pattern === 'function') {
          isMatch = pattern.pattern(entry);
        } else {
          isMatch = pattern.pattern.test(JSON.stringify(entry));
        }

        if (isMatch) {
          this.triggerAnomalyAlert(pattern, entry);
        }
      } catch (error) {
        console.error(`Error checking anomaly pattern ${pattern.name}:`, error);
      }
    }
  }

  private triggerAnomalyAlert(pattern: AnomalyPattern, triggerEntry: EnhancedSecurityLogEntry): void {
    const alertKey = `anomaly_${pattern.name}_${triggerEntry.context.ipAddress}`;
    const now = Date.now();
    const lastAlert = this.recentAlerts.get(alertKey);

    // クールダウンチェック（同じ異常パターンの重複アラート防止）
    if (lastAlert && (now - lastAlert) < 5 * 60 * 1000) {
      return;
    }

    this.recentAlerts.set(alertKey, now);

    const anomalyEntry: EnhancedSecurityLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level: pattern.severity === 'critical' ? EnhancedSecurityLogLevel.CRITICAL : EnhancedSecurityLogLevel.ERROR,
      eventType: EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC,
      message: `Anomaly detected: ${pattern.description}`,
      context: {
        ...triggerEntry.context,
        threat: {
          level: pattern.severity,
          indicators: [pattern.name],
          confidence: 85
        }
      },
      metadata: {
        anomalyPattern: pattern.name,
        triggerEventId: triggerEntry.id,
        correlatedEvents: [] // 実装時に関連イベントを追加
      },
      correlationId: triggerEntry.correlationId || this.generateCorrelationId(),
      tags: ['anomaly', 'auto-detected', pattern.severity],
      hash: ''
    };

    anomalyEntry.hash = this.generateLogHash(anomalyEntry);
    this.writeLogEntry(anomalyEntry);

    // イベントエミッター経由でアラート通知
    this.emit('anomalyDetected', {
      pattern,
      triggerEntry,
      anomalyEntry
    });
  }

  private checkAlertThresholds(entry: EnhancedSecurityLogEntry): void {
    const config = this.alertConfigs.get(entry.eventType);
    if (!config || !config.enabled) return;

    const key = `${entry.eventType}_${entry.context.userId || entry.context.ipAddress || 'unknown'}`;
    const now = Date.now();
    
    const existing = this.eventCounts.get(key);
    if (!existing || (now - existing.firstSeen) > config.timeWindow) {
      this.eventCounts.set(key, { count: 1, firstSeen: now, lastSeen: now });
      return;
    }

    existing.count++;
    existing.lastSeen = now;

    if (existing.count >= config.threshold) {
      this.triggerThresholdAlert(config, existing.count, entry);
      // カウンターをリセット（アラートスパム防止）
      this.eventCounts.set(key, { count: 0, firstSeen: now, lastSeen: now });
    }
  }

  private triggerThresholdAlert(config: AlertConfiguration, count: number, triggerEntry: EnhancedSecurityLogEntry): void {
    const alertKey = `threshold_${config.eventType}_${triggerEntry.context.ipAddress}`;
    const now = Date.now();
    const lastAlert = this.recentAlerts.get(alertKey);

    // クールダウンチェック
    if (lastAlert && (now - lastAlert) < config.cooldownPeriod) {
      return;
    }

    this.recentAlerts.set(alertKey, now);

    const alertEntry: EnhancedSecurityLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level: config.severity === 'critical' ? EnhancedSecurityLogLevel.CRITICAL : 
             config.severity === 'high' ? EnhancedSecurityLogLevel.ERROR : EnhancedSecurityLogLevel.WARNING,
      eventType: EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC,
      message: `Alert threshold exceeded: ${config.eventType}`,
      context: {
        ...triggerEntry.context,
        threat: {
          level: config.severity,
          indicators: [`${config.eventType}_threshold_exceeded`],
          confidence: 95
        }
      },
      metadata: {
        alertType: 'threshold',
        originalEventType: config.eventType,
        eventCount: count,
        timeWindow: config.timeWindow,
        threshold: config.threshold
      },
      correlationId: triggerEntry.correlationId || this.generateCorrelationId(),
      tags: ['alert', 'threshold', config.severity],
      hash: ''
    };

    alertEntry.hash = this.generateLogHash(alertEntry);
    this.writeLogEntry(alertEntry);

    // イベントエミッター経由でアラート通知
    this.emit('thresholdAlert', {
      config,
      count,
      triggerEntry,
      alertEntry
    });
  }

  /**
   * 詳細セキュリティログを記録
   */
  public log(
    level: EnhancedSecurityLogLevel,
    eventType: EnhancedSecurityEventType,
    message: string,
    context: Partial<SecurityContext> = {},
    metadata?: Record<string, any>,
    correlationId?: string
  ): string {
    const sanitizedMetadata = metadata ? this.sanitizeForLogging(metadata) : undefined;
    
    const entry: EnhancedSecurityLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      eventType,
      message,
      context: {
        ...context,
        sessionId: context.sessionId ? 
          crypto.createHash('sha256').update(context.sessionId).digest('hex').substring(0, 8) : undefined,
        userAgent: context.userAgent ? context.userAgent.substring(0, 200) : undefined
      },
      metadata: sanitizedMetadata,
      correlationId: correlationId || this.generateCorrelationId(),
      tags: [eventType, level],
      hash: ''
    };

    entry.hash = this.generateLogHash(entry);
    
    this.writeLogEntry(entry);
    
    // 異常パターンと閾値チェック
    this.checkAnomalyPatterns(entry);
    this.checkAlertThresholds(entry);
    
    // ログイベントを発行
    this.emit('logEntry', entry);
    
    return entry.id;
  }

  /**
   * 統計情報を取得
   */
  public getLogStats(): {
    totalSize: number;
    fileCount: number;
    lastModified?: Date;
    alertsLast24h: number;
    criticalEventsLast24h: number;
  } {
    try {
      let totalSize = 0;
      let fileCount = 0;
      let lastModified: Date | undefined;

      const files = fs.readdirSync(this.logDirectory)
        .filter(file => file.startsWith('enhanced-security.log'));
      
      for (const file of files) {
        const filePath = path.join(this.logDirectory, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileCount++;
        
        if (!lastModified || stats.mtime > lastModified) {
          lastModified = stats.mtime;
        }
      }

      // 過去24時間のアラート・重要イベント数を計算
      const alertsLast24h = this.countRecentEvents(24 * 60 * 60 * 1000, 
        [EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC]);
      const criticalEventsLast24h = this.countRecentEventsByLevel(24 * 60 * 60 * 1000, 
        EnhancedSecurityLogLevel.CRITICAL);

      return { totalSize, fileCount, lastModified, alertsLast24h, criticalEventsLast24h };
    } catch (error) {
      return { totalSize: 0, fileCount: 0, alertsLast24h: 0, criticalEventsLast24h: 0 };
    }
  }

  private countRecentEvents(timeWindow: number, eventTypes: EnhancedSecurityEventType[]): number {
    // 実装：最近のログファイルを読み込んで指定されたイベントタイプをカウント
    // パフォーマンスのため、実際の実装では効率的なログ検索を行う
    return 0; // プレースホルダー
  }

  private countRecentEventsByLevel(timeWindow: number, level: EnhancedSecurityLogLevel): number {
    // 実装：最近のログファイルを読み込んで指定されたレベルのイベントをカウント
    return 0; // プレースホルダー
  }

  // 便利メソッド - 既存の securityLogger との互換性保持
  public logAuthSuccess(userId: string, ipAddress?: string, userAgent?: string): string {
    return this.log(
      EnhancedSecurityLogLevel.INFO,
      EnhancedSecurityEventType.AUTH_SUCCESS,
      'User authentication successful',
      { userId, ipAddress, userAgent }
    );
  }

  public logAuthFailure(username?: string, ipAddress?: string, userAgent?: string, reason?: string): string {
    return this.log(
      EnhancedSecurityLogLevel.WARNING,
      EnhancedSecurityEventType.AUTH_FAILURE,
      'User authentication failed',
      { ipAddress, userAgent },
      { username: username ? '[REDACTED]' : undefined, reason }
    );
  }

  public logSuspiciousActivity(description: string, userId?: string, ipAddress?: string, metadata?: Record<string, any>): string {
    return this.log(
      EnhancedSecurityLogLevel.ERROR,
      EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC,
      `Suspicious activity: ${description}`,
      { userId, ipAddress },
      metadata
    );
  }
}

// シングルトンインスタンス
export const enhancedSecurityLogger = new EnhancedSecurityLogger();