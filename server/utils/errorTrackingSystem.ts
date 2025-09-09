/**
 * エラートラッキング・分析システム
 * 詳細なエラー追跡、パターン分析、アラート機能
 */

import fs from 'fs';
import path from 'path';
import { enhancedSecurityLogger, EnhancedSecurityLogLevel, EnhancedSecurityEventType } from './enhancedSecurityLogger';
import { ErrorCategory, ErrorSeverity, EnhancedError } from '../middleware/enhancedErrorHandling';

// エラートラッキングエントリ
interface ErrorTrackingEntry {
  id: string;
  timestamp: string;
  error: {
    name: string;
    message: string;
    stack?: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    code?: string;
  };
  request: {
    method: string;
    path: string;
    url: string;
    ip: string;
    userAgent?: string;
    headers: Record<string, any>;
    query?: any;
    params?: any;
    body?: any;
  };
  user: {
    id?: string;
    sessionId?: string;
  };
  system: {
    nodeEnv: string;
    memory: NodeJS.MemoryUsage;
    uptime: number;
  };
  correlationId: string;
  resolved: boolean;
  resolutionNotes?: string;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  tags: string[];
}

// エラー統計データ
interface ErrorStats {
  period: {
    start: string;
    end: string;
    durationHours: number;
  };
  totals: {
    errors: number;
    uniqueErrors: number;
    resolvedErrors: number;
    unresolvedErrors: number;
  };
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  byStatus: Record<number, number>;
  topErrors: Array<{
    errorHash: string;
    message: string;
    count: number;
    lastOccurrence: string;
    severity: ErrorSeverity;
  }>;
  trends: {
    hourlyDistribution: Array<{
      hour: number;
      count: number;
    }>;
    dailyAverage: number;
    peakHour: number;
  };
  performance: {
    averageResponseTime: number;
    slowestEndpoints: Array<{
      path: string;
      avgResponseTime: number;
      errorRate: number;
    }>;
  };
}

// エラーパターン分析
interface ErrorPattern {
  id: string;
  description: string;
  pattern: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    pathPattern?: RegExp;
    messagePattern?: RegExp;
    userAgentPattern?: RegExp;
    ipPattern?: RegExp;
  };
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  suggestions: string[];
  autoResolve: boolean;
}

/**
 * エラーハッシュ生成（類似エラーのグループ化用）
 */
class ErrorHashGenerator {
  static generateHash(error: EnhancedError, requestPath: string): string {
    const hashInput = [
      error.name,
      this.normalizeMessage(error.message),
      error.code || '',
      requestPath.replace(/\/\d+/g, '/:id'), // IDパラメータの正規化
      error.category || '',
      (error.stack || '').split('\n')[0] // スタックトレースの最初の行のみ
    ].join('|');

    // 簡単なハッシュ生成
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit integer に変換
    }
    
    return Math.abs(hash).toString(16);
  }

  private static normalizeMessage(message: string): string {
    // メッセージから動的な部分を除去して正規化
    return message
      .replace(/\d+/g, 'N') // 数字を N に置換
      .replace(/['"]\w+['"]?/g, 'STRING') // 文字列リテラルを STRING に置換
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'EMAIL') // メールアドレスを EMAIL に置換
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, 'IP') // IPアドレスを IP に置換
      .toLowerCase();
  }
}

/**
 * エラーパターン検出器
 */
class ErrorPatternDetector {
  private patterns: ErrorPattern[] = [
    {
      id: 'database_connection_failure',
      description: 'データベース接続エラーの連続発生',
      pattern: {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        messagePattern: /connection|connect|timeout/i
      },
      occurrences: 0,
      firstSeen: '',
      lastSeen: '',
      impact: 'critical',
      suggestions: [
        'データベースサーバーの状態を確認してください',
        '接続プールの設定を見直してください',
        'ネットワーク接続を確認してください'
      ],
      autoResolve: false
    },
    {
      id: 'authentication_brute_force',
      description: '認証の連続失敗（ブルートフォース攻撃の可能性）',
      pattern: {
        category: ErrorCategory.AUTHENTICATION,
        pathPattern: /\/api\/(login|auth)/i,
        messagePattern: /invalid|unauthorized|credential/i
      },
      occurrences: 0,
      firstSeen: '',
      lastSeen: '',
      impact: 'high',
      suggestions: [
        'IPアドレスからのアクセスを制限してください',
        'レート制限を強化してください',
        'CAPTCHAの実装を検討してください'
      ],
      autoResolve: false
    },
    {
      id: 'memory_leak_indicator',
      description: 'メモリ不足エラーの増加傾向',
      pattern: {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        messagePattern: /memory|heap|out of memory/i
      },
      occurrences: 0,
      firstSeen: '',
      lastSeen: '',
      impact: 'critical',
      suggestions: [
        'メモリ使用量を監視してください',
        'メモリリークの原因を特定してください',
        'ガベージコレクション設定を最適化してください'
      ],
      autoResolve: false
    },
    {
      id: 'external_api_degradation',
      description: '外部API呼び出しエラーの増加',
      pattern: {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        messagePattern: /api|request failed|timeout/i
      },
      occurrences: 0,
      firstSeen: '',
      lastSeen: '',
      impact: 'medium',
      suggestions: [
        '外部APIの状態を確認してください',
        'リトライロジックを実装してください',
        'フォールバック機能を検討してください'
      ],
      autoResolve: true
    }
  ];

  detectPatterns(entries: ErrorTrackingEntry[]): ErrorPattern[] {
    const detectedPatterns: ErrorPattern[] = [];
    
    for (const pattern of this.patterns) {
      const matchingEntries = entries.filter(entry => this.matchesPattern(entry, pattern));
      
      if (matchingEntries.length > 0) {
        const updatedPattern: ErrorPattern = {
          ...pattern,
          occurrences: matchingEntries.length,
          firstSeen: matchingEntries[matchingEntries.length - 1].timestamp,
          lastSeen: matchingEntries[0].timestamp
        };
        
        detectedPatterns.push(updatedPattern);
      }
    }
    
    return detectedPatterns.sort((a, b) => b.occurrences - a.occurrences);
  }

  private matchesPattern(entry: ErrorTrackingEntry, pattern: ErrorPattern): boolean {
    const { pattern: p } = pattern;
    
    if (p.category && entry.error.category !== p.category) {
      return false;
    }
    
    if (p.severity && entry.error.severity !== p.severity) {
      return false;
    }
    
    if (p.pathPattern && !p.pathPattern.test(entry.request.path)) {
      return false;
    }
    
    if (p.messagePattern && !p.messagePattern.test(entry.error.message)) {
      return false;
    }
    
    if (p.userAgentPattern && entry.request.userAgent && 
        !p.userAgentPattern.test(entry.request.userAgent)) {
      return false;
    }
    
    if (p.ipPattern && !p.ipPattern.test(entry.request.ip)) {
      return false;
    }
    
    return true;
  }
}

/**
 * エラーアラートシステム
 */
class ErrorAlertSystem {
  private alertThresholds = {
    [ErrorSeverity.CRITICAL]: 1, // 1件でアラート
    [ErrorSeverity.HIGH]: 3,     // 3件でアラート
    [ErrorSeverity.MEDIUM]: 10,  // 10件でアラート
    [ErrorSeverity.LOW]: 50      // 50件でアラート
  };

  private lastAlertTimes: Map<string, number> = new Map();
  private readonly ALERT_COOLDOWN = 15 * 60 * 1000; // 15分のクールダウン

  shouldSendAlert(errorHash: string, severity: ErrorSeverity, count: number): boolean {
    const threshold = this.alertThresholds[severity];
    if (count < threshold) {
      return false;
    }

    // クールダウンチェック
    const lastAlertTime = this.lastAlertTimes.get(errorHash) || 0;
    const now = Date.now();
    
    if (now - lastAlertTime < this.ALERT_COOLDOWN) {
      return false;
    }

    this.lastAlertTimes.set(errorHash, now);
    return true;
  }

  async sendAlert(entry: ErrorTrackingEntry, count: number): Promise<void> {
    const alertData = {
      type: 'ERROR_THRESHOLD_EXCEEDED',
      severity: entry.error.severity,
      error: {
        message: entry.error.message,
        category: entry.error.category,
        count,
        correlationId: entry.correlationId
      },
      request: {
        path: entry.request.path,
        method: entry.request.method,
        ip: entry.request.ip
      },
      timestamp: new Date().toISOString()
    };

    // セキュリティログにアラートを記録
    enhancedSecurityLogger.log(
      EnhancedSecurityLogLevel.WARNING,
      EnhancedSecurityEventType.ABNORMAL_TRAFFIC,
      `Error alert: ${entry.error.message}`,
      {
        userId: entry.user.id,
        sessionId: entry.user.sessionId,
        ipAddress: entry.request.ip,
        endpoint: entry.request.path
      },
      alertData
    );

    // TODO: 実際のアラート送信（Slack、メール等）
    console.log('🚨 Error Alert:', alertData);
  }
}

/**
 * メインのエラートラッキングシステム
 */
export class ErrorTrackingSystem {
  private entries: Map<string, ErrorTrackingEntry> = new Map();
  private patternDetector: ErrorPatternDetector;
  private alertSystem: ErrorAlertSystem;
  private logDirectory: string;
  private maxEntries = 10000; // メモリ内に保持する最大エントリ数

  constructor() {
    this.patternDetector = new ErrorPatternDetector();
    this.alertSystem = new ErrorAlertSystem();
    this.logDirectory = path.join(process.cwd(), 'logs', 'error-tracking');
    this.ensureLogDirectory();
    this.setupCleanup();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private setupCleanup(): void {
    // 1時間ごとに古いエントリをクリーンアップ
    setInterval(() => {
      this.cleanupOldEntries();
    }, 60 * 60 * 1000);
  }

  /**
   * エラーの記録
   */
  async trackError(
    error: EnhancedError,
    request: {
      method: string;
      path: string;
      url: string;
      ip: string;
      userAgent?: string;
      headers: any;
      query?: any;
      params?: any;
      body?: any;
    },
    user: {
      id?: string;
      sessionId?: string;
    }
  ): Promise<string> {
    const errorHash = ErrorHashGenerator.generateHash(error, request.path);
    const timestamp = new Date().toISOString();
    const entryId = `${timestamp}_${errorHash}`;

    // 既存エントリの確認
    const existingEntry = this.findExistingEntry(errorHash);
    
    if (existingEntry) {
      // 既存エントリを更新
      existingEntry.occurrenceCount++;
      existingEntry.lastOccurrence = timestamp;
      existingEntry.resolved = false; // 再発生のため未解決に戻す

      // アラートチェック
      if (this.alertSystem.shouldSendAlert(errorHash, error.severity!, existingEntry.occurrenceCount)) {
        await this.alertSystem.sendAlert(existingEntry, existingEntry.occurrenceCount);
      }

      await this.saveEntryToFile(existingEntry);
      return existingEntry.id;
    }

    // 新しいエントリを作成
    const entry: ErrorTrackingEntry = {
      id: entryId,
      timestamp,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        category: error.category!,
        severity: error.severity!,
        code: error.code
      },
      request: {
        method: request.method,
        path: request.path,
        url: request.url,
        ip: request.ip,
        userAgent: request.userAgent,
        headers: this.sanitizeHeaders(request.headers),
        query: request.query,
        params: request.params,
        body: this.sanitizeBody(request.body)
      },
      user: {
        id: user.id,
        sessionId: user.sessionId
      },
      system: {
        nodeEnv: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      correlationId: error.correlationId || entryId,
      resolved: false,
      occurrenceCount: 1,
      firstOccurrence: timestamp,
      lastOccurrence: timestamp,
      tags: this.generateTags(error, request)
    };

    // メモリ内ストレージ
    this.entries.set(errorHash, entry);

    // ファイルに保存
    await this.saveEntryToFile(entry);

    // メモリ制限チェック
    if (this.entries.size > this.maxEntries) {
      this.cleanupOldEntries();
    }

    return entry.id;
  }

  private findExistingEntry(errorHash: string): ErrorTrackingEntry | undefined {
    return this.entries.get(errorHash);
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  private generateTags(error: EnhancedError, request: any): string[] {
    const tags: string[] = [];
    
    tags.push(`category:${error.category}`);
    tags.push(`severity:${error.severity}`);
    tags.push(`method:${request.method}`);
    
    if (error.code) {
      tags.push(`code:${error.code}`);
    }
    
    if (request.path.startsWith('/api/')) {
      tags.push('api');
    }
    
    const status = error.status || error.statusCode;
    if (status) {
      tags.push(`status:${status}`);
    }
    
    return tags;
  }

  private async saveEntryToFile(entry: ErrorTrackingEntry): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const filename = `error-tracking-${date}.log`;
      const filepath = path.join(this.logDirectory, filename);
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filepath, logLine);
    } catch (error) {
      console.error('Error saving tracking entry to file:', error);
    }
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24時間

    for (const [hash, entry] of this.entries) {
      const entryAge = now - new Date(entry.timestamp).getTime();
      if (entryAge > maxAge) {
        this.entries.delete(hash);
      }
    }
  }

  /**
   * エラー統計の生成
   */
  async generateStats(hoursBack: number = 24): Promise<ErrorStats> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursBack * 60 * 60 * 1000));
    
    const entries = await this.loadEntriesFromFiles(startTime, endTime);
    
    // 基本統計
    const totals = {
      errors: entries.length,
      uniqueErrors: new Set(entries.map(e => ErrorHashGenerator.generateHash(e.error as any, e.request.path))).size,
      resolvedErrors: entries.filter(e => e.resolved).length,
      unresolvedErrors: entries.filter(e => !e.resolved).length
    };

    // カテゴリ別統計
    const byCategory: Record<ErrorCategory, number> = {} as any;
    Object.values(ErrorCategory).forEach(cat => {
      byCategory[cat] = 0;
    });
    entries.forEach(entry => {
      byCategory[entry.error.category]++;
    });

    // 重要度別統計
    const bySeverity: Record<ErrorSeverity, number> = {} as any;
    Object.values(ErrorSeverity).forEach(sev => {
      bySeverity[sev] = 0;
    });
    entries.forEach(entry => {
      bySeverity[entry.error.severity]++;
    });

    // ステータス別統計
    const byStatus: Record<number, number> = {};
    entries.forEach(entry => {
      const status = (entry.error as any).status || 500;
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    // 上位エラー
    const errorCounts = new Map<string, {
      message: string;
      count: number;
      lastOccurrence: string;
      severity: ErrorSeverity;
    }>();

    entries.forEach(entry => {
      const hash = ErrorHashGenerator.generateHash(entry.error as any, entry.request.path);
      const existing = errorCounts.get(hash);
      
      if (existing) {
        existing.count++;
        if (new Date(entry.timestamp) > new Date(existing.lastOccurrence)) {
          existing.lastOccurrence = entry.timestamp;
        }
      } else {
        errorCounts.set(hash, {
          message: entry.error.message,
          count: 1,
          lastOccurrence: entry.timestamp,
          severity: entry.error.severity
        });
      }
    });

    const topErrors = Array.from(errorCounts.entries())
      .map(([hash, data]) => ({
        errorHash: hash,
        ...data
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 時間別分布
    const hourlyDistribution: Array<{ hour: number; count: number }> = [];
    for (let i = 0; i < 24; i++) {
      hourlyDistribution.push({ hour: i, count: 0 });
    }
    
    entries.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      hourlyDistribution[hour].count++;
    });

    const peakHour = hourlyDistribution.reduce((prev, curr) => 
      curr.count > prev.count ? curr : prev
    ).hour;

    return {
      period: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        durationHours: hoursBack
      },
      totals,
      byCategory,
      bySeverity,
      byStatus,
      topErrors,
      trends: {
        hourlyDistribution,
        dailyAverage: totals.errors / (hoursBack / 24),
        peakHour
      },
      performance: {
        averageResponseTime: 0, // TODO: 実装
        slowestEndpoints: [] // TODO: 実装
      }
    };
  }

  private async loadEntriesFromFiles(startTime: Date, endTime: Date): Promise<ErrorTrackingEntry[]> {
    const entries: ErrorTrackingEntry[] = [];
    
    try {
      // メモリ内のエントリを追加
      for (const entry of this.entries.values()) {
        const entryTime = new Date(entry.timestamp);
        if (entryTime >= startTime && entryTime <= endTime) {
          entries.push(entry);
        }
      }

      // ファイルからエントリを読み込み
      const files = fs.readdirSync(this.logDirectory)
        .filter(file => file.startsWith('error-tracking-') && file.endsWith('.log'))
        .sort()
        .reverse(); // 新しいファイルから

      for (const file of files) {
        const filepath = path.join(this.logDirectory, file);
        const content = fs.readFileSync(filepath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const entry: ErrorTrackingEntry = JSON.parse(line);
            const entryTime = new Date(entry.timestamp);
            
            if (entryTime >= startTime && entryTime <= endTime) {
              entries.push(entry);
            }
          } catch (parseError) {
            // 無効なJSONをスキップ
            continue;
          }
        }
      }
    } catch (error) {
      console.error('Error loading entries from files:', error);
    }

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * エラーパターンの検出
   */
  async detectErrorPatterns(hoursBack: number = 24): Promise<ErrorPattern[]> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursBack * 60 * 60 * 1000));
    const entries = await this.loadEntriesFromFiles(startTime, endTime);
    
    return this.patternDetector.detectPatterns(entries);
  }

  /**
   * エラーの解決マーク
   */
  async resolveError(errorId: string, resolutionNotes: string): Promise<boolean> {
    // メモリ内検索
    for (const entry of this.entries.values()) {
      if (entry.id === errorId) {
        entry.resolved = true;
        entry.resolutionNotes = resolutionNotes;
        await this.saveEntryToFile(entry);
        return true;
      }
    }

    // ファイル内検索（実装省略 - 実際の環境では必要）
    return false;
  }

  /**
   * ダッシュボード用データの取得
   */
  async getDashboardData(): Promise<{
    recentErrors: ErrorTrackingEntry[];
    criticalErrors: ErrorTrackingEntry[];
    errorPatterns: ErrorPattern[];
    quickStats: {
      last24Hours: number;
      last1Hour: number;
      criticalCount: number;
      resolvedCount: number;
    };
  }> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const last1Hour = new Date(now.getTime() - (1 * 60 * 60 * 1000));

    const recentEntries = await this.loadEntriesFromFiles(last24Hours, now);
    
    return {
      recentErrors: recentEntries.slice(0, 20),
      criticalErrors: recentEntries.filter(e => e.error.severity === ErrorSeverity.CRITICAL).slice(0, 10),
      errorPatterns: await this.detectErrorPatterns(24),
      quickStats: {
        last24Hours: recentEntries.length,
        last1Hour: recentEntries.filter(e => new Date(e.timestamp) >= last1Hour).length,
        criticalCount: recentEntries.filter(e => e.error.severity === ErrorSeverity.CRITICAL && !e.resolved).length,
        resolvedCount: recentEntries.filter(e => e.resolved).length
      }
    };
  }
}

// シングルトンインスタンス
export const errorTrackingSystem = new ErrorTrackingSystem();