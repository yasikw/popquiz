import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// セキュリティログレベル
export enum SecurityLogLevel {
  INFO = 'info',
  WARNING = 'warning', 
  ERROR = 'error',
  CRITICAL = 'critical'
}

// セキュリティイベントタイプ
export enum SecurityEventType {
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILURE = 'auth_failure',
  AUTH_MULTIPLE_FAILURES = 'auth_multiple_failures',
  PERMISSION_DENIED = 'permission_denied',
  FILE_UPLOAD_ATTEMPT = 'file_upload_attempt',
  FILE_UPLOAD_REJECTED = 'file_upload_rejected',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_VIOLATION = 'csrf_violation',
  SESSION_HIJACK_ATTEMPT = 'session_hijack_attempt',
  ABNORMAL_TRAFFIC = 'abnormal_traffic'
}

// ログエントリの構造
interface SecurityLogEntry {
  timestamp: string;
  level: SecurityLogLevel;
  eventType: SecurityEventType;
  message: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  metadata?: Record<string, any>;
  hash: string; // ログの改ざん検知用
}

// 機密情報をサニタイズする関数
function sanitizeForLogging(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'session', 'csrf', 'api_key', 'access_token',
    'refresh_token', 'private_key', 'credit_card', 'ssn'
  ];

  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // ネストされたオブジェクトも再帰的にサニタイズ
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized;
}

// ログエントリのハッシュを生成（改ざん検知用）
function generateLogHash(entry: Omit<SecurityLogEntry, 'hash'>): string {
  const data = JSON.stringify(entry);
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

class SecurityLogger {
  private logDirectory: string;
  private logFile: string;
  private maxLogSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 5;
  private alertThresholds: Map<SecurityEventType, number> = new Map();
  private eventCounts: Map<string, { count: number; lastReset: number }> = new Map();

  constructor() {
    this.logDirectory = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDirectory, 'security.log');
    this.initializeLogger();
    this.setupAlertThresholds();
  }

  private initializeLogger(): void {
    // ログディレクトリを作成
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private setupAlertThresholds(): void {
    // アラートのしきい値を設定
    this.alertThresholds.set(SecurityEventType.AUTH_FAILURE, 5); // 5回連続失敗
    this.alertThresholds.set(SecurityEventType.PERMISSION_DENIED, 10); // 10回権限エラー
    this.alertThresholds.set(SecurityEventType.RATE_LIMIT_EXCEEDED, 20); // 20回レート制限
    this.alertThresholds.set(SecurityEventType.FILE_UPLOAD_REJECTED, 15); // 15回拒否
    this.alertThresholds.set(SecurityEventType.SUSPICIOUS_ACTIVITY, 3); // 3回怪しい活動
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

      // 既存のローテーションファイルをシフト
      for (let i = this.maxLogFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxLogFiles - 1) {
            fs.unlinkSync(oldFile); // 最古のファイルを削除
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // 現在のログファイルをローテーション
      fs.renameSync(this.logFile, `${this.logFile}.1`);
    } catch (error) {
      console.error('Log rotation failed:', error);
    }
  }

  private checkAlertThresholds(eventType: SecurityEventType, userId?: string, ipAddress?: string): void {
    const threshold = this.alertThresholds.get(eventType);
    if (!threshold) return;

    const key = `${eventType}-${userId || ipAddress || 'unknown'}`;
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    // 1時間ごとにカウンターをリセット
    const existing = this.eventCounts.get(key);
    if (!existing || (now - existing.lastReset) > hourInMs) {
      this.eventCounts.set(key, { count: 1, lastReset: now });
      return;
    }

    existing.count++;
    
    if (existing.count >= threshold) {
      this.triggerAlert(eventType, existing.count, userId, ipAddress);
      // カウンターをリセット（スパム防止）
      this.eventCounts.set(key, { count: 0, lastReset: now });
    }
  }

  private triggerAlert(eventType: SecurityEventType, count: number, userId?: string, ipAddress?: string): void {
    const alertEntry: SecurityLogEntry = {
      timestamp: new Date().toISOString(),
      level: SecurityLogLevel.CRITICAL,
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      message: `Alert: ${eventType} threshold exceeded`,
      userId,
      ipAddress,
      metadata: {
        originalEventType: eventType,
        eventCount: count,
        timeWindow: '1 hour',
        action: 'alert_triggered'
      },
      hash: ''
    };

    alertEntry.hash = generateLogHash(alertEntry);
    
    // アラートログを即座に書き込み
    this.writeLogEntry(alertEntry);
    
    // 本番環境では、ここで実際の通知システム（メール、Slack等）を呼び出す
    console.error(`🚨 SECURITY ALERT: ${alertEntry.message}`, {
      count,
      userId,
      ipAddress,
      eventType
    });
  }

  private writeLogEntry(entry: SecurityLogEntry): void {
    try {
      this.rotateLogsIfNeeded();
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFile, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write security log:', error);
    }
  }

  public log(
    level: SecurityLogLevel,
    eventType: SecurityEventType,
    message: string,
    options: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      endpoint?: string;
      method?: string;
      statusCode?: number;
      metadata?: Record<string, any>;
    } = {}
  ): void {
    // 機密情報をサニタイズ
    const sanitizedMetadata = options.metadata ? sanitizeForLogging(options.metadata) : undefined;
    
    const entry: SecurityLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      eventType,
      message,
      userId: options.userId,
      sessionId: options.sessionId ? crypto.createHash('sha256').update(options.sessionId).digest('hex').substring(0, 8) : undefined, // セッションIDをハッシュ化
      ipAddress: options.ipAddress,
      userAgent: options.userAgent ? options.userAgent.substring(0, 200) : undefined, // User-Agentを制限
      endpoint: options.endpoint,
      method: options.method,
      statusCode: options.statusCode,
      metadata: sanitizedMetadata,
      hash: ''
    };

    entry.hash = generateLogHash(entry);
    
    this.writeLogEntry(entry);
    
    // アラートしきい値をチェック
    if ([SecurityEventType.AUTH_FAILURE, SecurityEventType.PERMISSION_DENIED, 
         SecurityEventType.RATE_LIMIT_EXCEEDED, SecurityEventType.FILE_UPLOAD_REJECTED,
         SecurityEventType.SUSPICIOUS_ACTIVITY].includes(eventType)) {
      this.checkAlertThresholds(eventType, options.userId, options.ipAddress);
    }
  }

  // 便利メソッド
  public logAuthSuccess(userId: string, ipAddress?: string, userAgent?: string): void {
    this.log(SecurityLogLevel.INFO, SecurityEventType.AUTH_SUCCESS, 'User authentication successful', {
      userId,
      ipAddress,
      userAgent
    });
  }

  public logAuthFailure(username?: string, ipAddress?: string, userAgent?: string, reason?: string): void {
    this.log(SecurityLogLevel.WARNING, SecurityEventType.AUTH_FAILURE, 'User authentication failed', {
      ipAddress,
      userAgent,
      metadata: { username: username ? '[REDACTED]' : undefined, reason }
    });
  }

  public logPermissionDenied(userId?: string, endpoint?: string, ipAddress?: string): void {
    this.log(SecurityLogLevel.WARNING, SecurityEventType.PERMISSION_DENIED, 'Access permission denied', {
      userId,
      endpoint,
      ipAddress
    });
  }

  public logFileUpload(userId?: string, filename?: string, size?: number, mimetype?: string, ipAddress?: string): void {
    this.log(SecurityLogLevel.INFO, SecurityEventType.FILE_UPLOAD_ATTEMPT, 'File upload attempt', {
      userId,
      ipAddress,
      metadata: {
        filename: filename ? path.basename(filename) : undefined, // パスを除去
        size,
        mimetype
      }
    });
  }

  public logFileUploadRejected(userId?: string, filename?: string, reason?: string, ipAddress?: string): void {
    this.log(SecurityLogLevel.WARNING, SecurityEventType.FILE_UPLOAD_REJECTED, 'File upload rejected', {
      userId,
      ipAddress,
      metadata: {
        filename: filename ? path.basename(filename) : undefined,
        reason
      }
    });
  }

  public logRateLimitExceeded(ipAddress?: string, endpoint?: string, userId?: string): void {
    this.log(SecurityLogLevel.WARNING, SecurityEventType.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', {
      userId,
      ipAddress,
      endpoint
    });
  }

  public logSuspiciousActivity(description: string, userId?: string, ipAddress?: string, metadata?: Record<string, any>): void {
    this.log(SecurityLogLevel.ERROR, SecurityEventType.SUSPICIOUS_ACTIVITY, `Suspicious activity: ${description}`, {
      userId,
      ipAddress,
      metadata
    });
  }

  // ログファイルの統計情報を取得
  public getLogStats(): { totalSize: number; fileCount: number; lastModified?: Date } {
    try {
      let totalSize = 0;
      let fileCount = 0;
      let lastModified: Date | undefined;

      const files = fs.readdirSync(this.logDirectory).filter(file => file.startsWith('security.log'));
      
      for (const file of files) {
        const filePath = path.join(this.logDirectory, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        fileCount++;
        
        if (!lastModified || stats.mtime > lastModified) {
          lastModified = stats.mtime;
        }
      }

      return { totalSize, fileCount, lastModified };
    } catch (error) {
      return { totalSize: 0, fileCount: 0 };
    }
  }
}

// シングルトンインスタンス
export const securityLogger = new SecurityLogger();

// Express用のミドルウェア
export function securityLoggingMiddleware(req: any, res: any, next: any): void {
  const startTime = Date.now();
  const originalSend = res.send;

  res.send = function(data: any) {
    const responseTime = Date.now() - startTime;
    
    // レスポンス完了時にログ記録
    if (res.statusCode >= 400) {
      const isAuthError = res.statusCode === 401 || res.statusCode === 403;
      const eventType = isAuthError ? SecurityEventType.AUTH_FAILURE : SecurityEventType.PERMISSION_DENIED;
      
      securityLogger.log(
        res.statusCode >= 500 ? SecurityLogLevel.ERROR : SecurityLogLevel.WARNING,
        eventType,
        `HTTP ${res.statusCode} response`,
        {
          userId: req.user?.id,
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          metadata: {
            responseTime,
            contentLength: data ? data.length : 0
          }
        }
      );
    }

    return originalSend.call(this, data);
  };

  next();
}