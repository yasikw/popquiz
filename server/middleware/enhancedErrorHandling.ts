/**
 * 強化されたエラーハンドリングシステム
 * 環境別情報制御、セキュリティフィルタリング、詳細トラッキング機能
 */

import { Request, Response, NextFunction } from 'express';
import { enhancedSecurityLogger, EnhancedSecurityLogLevel, EnhancedSecurityEventType } from '../utils/enhancedSecurityLogger';

// エラー表示レベル設定
export enum ErrorDisclosureLevel {
  MINIMAL = 0,    // 最小限の情報のみ（本番推奨）
  BASIC = 1,      // 基本的な情報
  DETAILED = 2,   // 詳細情報（開発環境向け）
  FULL = 3        // 完全な情報（デバッグ用）
}

// エラーカテゴリ分類
export enum ErrorCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION', 
  VALIDATION = 'VALIDATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
  DATABASE = 'DATABASE',
  EXTERNAL_API = 'EXTERNAL_API',
  SECURITY = 'SECURITY',
  UNKNOWN = 'UNKNOWN'
}

// エラー重要度レベル
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// 拡張エラーインターフェース
export interface EnhancedError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  details?: any;
  originalError?: Error;
  sensitive?: boolean; // 機密情報を含むかどうか
}

// エラー設定インターフェース
interface ErrorHandlingConfig {
  disclosureLevel: ErrorDisclosureLevel;
  enableStackTrace: boolean;
  enableDetailedLogging: boolean;
  enableSecurityFiltering: boolean;
  enableErrorTracking: boolean;
  sanitizeResponses: boolean;
  logSensitiveData: boolean;
}

/**
 * 機密情報フィルタリング
 */
class SensitiveDataSanitizer {
  private readonly sensitivePatterns = [
    // パスワード・認証情報
    /password['":\s]*['"]\s*[^'"]+['"]/gi,
    /token['":\s]*['"]\s*[^'"]+['"]/gi,
    /secret['":\s]*['"]\s*[^'"]+['"]/gi,
    /key['":\s]*['"]\s*[^'"]+['"]/gi,
    /auth['":\s]*['"]\s*[^'"]+['"]/gi,
    
    // データベース接続情報
    /connection['":\s]*['"]\s*[^'"]+['"]/gi,
    /database['":\s]*['"]\s*[^'"]+['"]/gi,
    /postgresql:\/\/[^'"]+/gi,
    /mongodb:\/\/[^'"]+/gi,
    /mysql:\/\/[^'"]+/gi,
    
    // ファイルパス（Unixスタイル）
    /\/(?:home|root|usr|var|etc|opt|tmp)\/[^\s'"]+/gi,
    // ファイルパス（Windowsスタイル）
    /[A-Z]:\\(?:Users|Windows|Program Files)[^\s'"]+/gi,
    
    // IPアドレス（内部ネットワーク）
    /\b(?:192\.168|10\.|172\.(?:1[6-9]|2[0-9]|3[01]))\.[0-9]{1,3}\.[0-9]{1,3}\b/gi,
    
    // メールアドレス
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    
    // クレジットカード番号パターン
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/gi,
    
    // SQL接続文字列
    /(?:server|host|database|uid|pwd|password)\s*=\s*[^;'"\s]+/gi
  ];

  private readonly filePathPatterns = [
    // Node.js スタックトレースパス
    /\s+at\s+[^(]*\(([^:)]+):[0-9]+:[0-9]+\)/gi,
    /\s+at\s+([^:(\s]+):[0-9]+:[0-9]+/gi,
    // 一般的なファイルパス
    /\/[a-zA-Z0-9_\-./]+\.(js|ts|json|md|txt|log)(?::[0-9]+)?/gi,
    /[A-Z]:\\[a-zA-Z0-9_\-\\./]+\.(js|ts|json|md|txt|log)(?::[0-9]+)?/gi
  ];

  /**
   * 機密データのサニタイズ
   */
  sanitize(data: any, level: ErrorDisclosureLevel): any {
    if (typeof data === 'string') {
      return this.sanitizeString(data, level);
    }

    if (typeof data === 'object' && data !== null) {
      return this.sanitizeObject(data, level);
    }

    return data;
  }

  private sanitizeString(str: string, level: ErrorDisclosureLevel): string {
    let sanitized = str;

    // レベル別フィルタリング
    if (level <= ErrorDisclosureLevel.BASIC) {
      // 機密情報パターンを除去
      for (const pattern of this.sensitivePatterns) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }

    if (level <= ErrorDisclosureLevel.MINIMAL) {
      // ファイルパスを除去
      for (const pattern of this.filePathPatterns) {
        sanitized = sanitized.replace(pattern, '[PATH_REDACTED]');
      }
      
      // スタックトレースの詳細を除去
      sanitized = this.sanitizeStackTrace(sanitized);
    }

    return sanitized;
  }

  private sanitizeObject(obj: any, level: ErrorDisclosureLevel): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, level));
    }

    const sanitized: any = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // 機密情報キーの検出
        if (this.isSensitiveKey(key) && level <= ErrorDisclosureLevel.BASIC) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(obj[key], level);
        }
      }
    }

    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'pwd', 'secret', 'token', 'key', 'auth', 
      'authorization', 'credentials', 'connection', 'connectionString',
      'database', 'db', 'host', 'server', 'username', 'user',
      'email', 'phone', 'ssn', 'card', 'account'
    ];

    return sensitiveKeys.some(sensitiveKey => 
      key.toLowerCase().includes(sensitiveKey)
    );
  }

  private sanitizeStackTrace(stackTrace: string): string {
    const lines = stackTrace.split('\n');
    const sanitizedLines = lines.map(line => {
      // "at" で始まる行（スタックトレースの詳細）を簡略化
      if (line.trim().startsWith('at ')) {
        const match = line.match(/at\s+([^(]+)\s*\(/);
        if (match) {
          return `    at ${match[1]}([LOCATION_REDACTED])`;
        }
        return '    at [FUNCTION_REDACTED]';
      }
      return line;
    });

    return sanitizedLines.join('\n');
  }
}

/**
 * エラーカテゴリ分類器
 */
class ErrorCategorizer {
  categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // 認証エラー
    if (message.includes('unauthorized') || message.includes('authentication') || 
        message.includes('login') || message.includes('credential')) {
      return ErrorCategory.AUTHENTICATION;
    }

    // 認可エラー
    if (message.includes('forbidden') || message.includes('access denied') || 
        message.includes('permission') || message.includes('authorized')) {
      return ErrorCategory.AUTHORIZATION;
    }

    // バリデーションエラー
    if (message.includes('validation') || message.includes('invalid') || 
        message.includes('required') || message.includes('format')) {
      return ErrorCategory.VALIDATION;
    }

    // データベースエラー
    if (message.includes('database') || message.includes('sql') || 
        message.includes('connection') || stack.includes('postgres') || 
        stack.includes('mysql') || stack.includes('mongodb')) {
      return ErrorCategory.DATABASE;
    }

    // ネットワークエラー
    if (message.includes('network') || message.includes('connection') || 
        message.includes('timeout') || message.includes('econnrefused')) {
      return ErrorCategory.NETWORK;
    }

    // 外部APIエラー
    if (message.includes('api') || message.includes('request failed') || 
        message.includes('http')) {
      return ErrorCategory.EXTERNAL_API;
    }

    // セキュリティエラー
    if (message.includes('security') || message.includes('csrf') || 
        message.includes('xss') || message.includes('injection')) {
      return ErrorCategory.SECURITY;
    }

    // システムエラー
    if (message.includes('internal') || message.includes('system') || 
        message.includes('server')) {
      return ErrorCategory.SYSTEM;
    }

    return ErrorCategory.UNKNOWN;
  }

  determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const status = (error as any).status || (error as any).statusCode || 500;

    // セキュリティ関連は常に高い重要度
    if (category === ErrorCategory.SECURITY) {
      return ErrorSeverity.CRITICAL;
    }

    // ステータスコード別判定
    if (status >= 500) return ErrorSeverity.HIGH;
    if (status >= 400) return ErrorSeverity.MEDIUM;

    // カテゴリ別判定
    switch (category) {
      case ErrorCategory.DATABASE:
      case ErrorCategory.SYSTEM:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.VALIDATION:
      case ErrorCategory.BUSINESS_LOGIC:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }
}

/**
 * エラー統計トラッカー
 */
class ErrorStatsTracker {
  private errorCounts: Map<string, number> = new Map();
  private recentErrors: Array<{
    timestamp: number;
    category: ErrorCategory;
    severity: ErrorSeverity;
    path: string;
  }> = [];

  recordError(category: ErrorCategory, severity: ErrorSeverity, path: string): void {
    const key = `${category}:${severity}:${path}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // 最近のエラーを記録（最大1000件）
    this.recentErrors.push({
      timestamp: Date.now(),
      category,
      severity,
      path
    });

    if (this.recentErrors.length > 1000) {
      this.recentErrors.shift();
    }

    // 1時間以上古いエラーを除去
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.recentErrors = this.recentErrors.filter(
      error => error.timestamp > oneHourAgo
    );
  }

  getStats(): {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    errorsBySeverity: Record<string, number>;
    recentErrorRate: number; // errors per minute
  } {
    const totalErrors = this.recentErrors.length;
    const errorsByCategory: Record<string, number> = {};
    const errorsBySeverity: Record<string, number> = {};

    for (const error of this.recentErrors) {
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
    }

    // 分あたりのエラー率を計算
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    const recentErrorCount = this.recentErrors.filter(
      error => error.timestamp > tenMinutesAgo
    ).length;
    const recentErrorRate = recentErrorCount / 10; // 10分間の平均

    return {
      totalErrors,
      errorsByCategory,
      errorsBySeverity,
      recentErrorRate
    };
  }
}

/**
 * メインのエラーハンドリングシステム
 */
export class EnhancedErrorHandler {
  private config: ErrorHandlingConfig;
  private sanitizer: SensitiveDataSanitizer;
  private categorizer: ErrorCategorizer;
  private statsTracker: ErrorStatsTracker;

  constructor() {
    this.config = this.loadConfig();
    this.sanitizer = new SensitiveDataSanitizer();
    this.categorizer = new ErrorCategorizer();
    this.statsTracker = new ErrorStatsTracker();
  }

  private loadConfig(): ErrorHandlingConfig {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const errorLevel = process.env.ERROR_DISCLOSURE_LEVEL;

    let disclosureLevel: ErrorDisclosureLevel;
    
    if (errorLevel) {
      disclosureLevel = parseInt(errorLevel) as ErrorDisclosureLevel;
    } else {
      // 環境別デフォルト設定
      switch (nodeEnv) {
        case 'production':
          disclosureLevel = ErrorDisclosureLevel.MINIMAL;
          break;
        case 'staging':
          disclosureLevel = ErrorDisclosureLevel.BASIC;
          break;
        case 'development':
        case 'test':
        default:
          disclosureLevel = ErrorDisclosureLevel.FULL;
          break;
      }
    }

    return {
      disclosureLevel,
      enableStackTrace: nodeEnv !== 'production' || process.env.ENABLE_STACK_TRACE === 'true',
      enableDetailedLogging: process.env.ENABLE_DETAILED_ERROR_LOGGING !== 'false',
      enableSecurityFiltering: process.env.ENABLE_SECURITY_FILTERING !== 'false',
      enableErrorTracking: process.env.ENABLE_ERROR_TRACKING !== 'false',
      sanitizeResponses: nodeEnv === 'production' || process.env.SANITIZE_ERROR_RESPONSES === 'true',
      logSensitiveData: nodeEnv !== 'production' && process.env.LOG_SENSITIVE_DATA === 'true'
    };
  }

  /**
   * エラーの処理と応答生成
   */
  handleError(error: EnhancedError, req: Request): {
    status: number;
    response: any;
    logData: any;
  } {
    // エラーの拡張
    const enhancedError = this.enhanceError(error, req);
    
    // カテゴリと重要度の判定
    enhancedError.category = this.categorizer.categorizeError(error);
    enhancedError.severity = this.categorizer.determineSeverity(error, enhancedError.category);

    // 統計記録
    if (this.config.enableErrorTracking) {
      this.statsTracker.recordError(
        enhancedError.category,
        enhancedError.severity,
        req.path
      );
    }

    // ログデータ生成
    const logData = this.generateLogData(enhancedError, req);

    // クライアント応答生成
    const response = this.generateClientResponse(enhancedError, req);

    const status = enhancedError.status || enhancedError.statusCode || 500;

    return { status, response, logData };
  }

  private enhanceError(error: EnhancedError, req: Request): EnhancedError {
    // 既に拡張されている場合は追加情報のみ設定
    if (error.correlationId) {
      return error;
    }

    return {
      ...error,
      correlationId: req.headers['x-correlation-id'] as string || 
                     req.sessionID || 
                     `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: (req as any).user?.id,
      sessionId: req.sessionID,
      status: error.status || error.statusCode || 500
    };
  }

  private generateLogData(error: EnhancedError, req: Request): any {
    const baseLogData = {
      error: {
        name: error.name,
        message: error.message,
        category: error.category,
        severity: error.severity,
        status: error.status,
        code: error.code,
        correlationId: error.correlationId
      },
      request: {
        method: req.method,
        path: req.path,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        origin: req.get('Origin'),
        referer: req.get('Referer')
      },
      user: {
        id: error.userId,
        sessionId: error.sessionId
      },
      timestamp: new Date().toISOString()
    };

    // 詳細ログが有効な場合
    if (this.config.enableDetailedLogging) {
      (baseLogData as any).stack = this.config.enableStackTrace ? error.stack : undefined;
      (baseLogData as any).details = error.details;
      (baseLogData as any).headers = req.headers;
      (baseLogData as any).query = req.query;
      (baseLogData as any).params = req.params;
      
      // 機密データのログ記録が有効な場合のみボディを含める
      if (this.config.logSensitiveData) {
        (baseLogData as any).body = req.body;
      }
    }

    // セキュリティフィルタリング適用
    if (this.config.enableSecurityFiltering) {
      return this.sanitizer.sanitize(baseLogData, this.config.disclosureLevel);
    }

    return baseLogData;
  }

  private generateClientResponse(error: EnhancedError, req: Request): any {
    const status = error.status || error.statusCode || 500;
    
    const baseResponse = {
      error: true,
      timestamp: new Date().toISOString(),
      correlationId: error.correlationId,
      path: req.path
    };

    // 情報公開レベル別の応答生成
    switch (this.config.disclosureLevel) {
      case ErrorDisclosureLevel.MINIMAL:
        return {
          ...baseResponse,
          message: this.getGenericErrorMessage(status),
          code: 'INTERNAL_ERROR'
        };

      case ErrorDisclosureLevel.BASIC:
        return {
          ...baseResponse,
          message: status >= 500 
            ? this.getGenericErrorMessage(status)
            : this.sanitizer.sanitize(error.message, this.config.disclosureLevel),
          code: error.code || this.getGenericErrorCode(status)
        };

      case ErrorDisclosureLevel.DETAILED:
        const detailedResponse = {
          ...baseResponse,
          message: error.message,
          code: error.code || this.getGenericErrorCode(status),
          category: error.category,
          severity: error.severity
        };

        if (this.config.enableStackTrace && status >= 500) {
          (detailedResponse as any).stack = this.sanitizer.sanitize(
            error.stack, 
            this.config.disclosureLevel
          );
        }

        return detailedResponse;

      case ErrorDisclosureLevel.FULL:
        return {
          ...baseResponse,
          message: error.message,
          code: error.code || this.getGenericErrorCode(status),
          category: error.category,
          severity: error.severity,
          stack: error.stack,
          details: error.details
        };

      default:
        return {
          ...baseResponse,
          message: this.getGenericErrorMessage(status),
          code: 'INTERNAL_ERROR'
        };
    }
  }

  private getGenericErrorMessage(status: number): string {
    if (status >= 500) {
      return 'サーバーでエラーが発生しました。後ほど再試行してください。';
    } else if (status === 404) {
      return 'リクエストされたリソースが見つかりません。';
    } else if (status === 403) {
      return 'このリソースにアクセスする権限がありません。';
    } else if (status === 401) {
      return '認証が必要です。ログインしてください。';
    } else if (status >= 400) {
      return 'リクエストに問題があります。入力内容を確認してください。';
    }
    
    return 'エラーが発生しました。';
  }

  private getGenericErrorCode(status: number): string {
    if (status >= 500) return 'INTERNAL_SERVER_ERROR';
    if (status === 404) return 'NOT_FOUND';
    if (status === 403) return 'FORBIDDEN';
    if (status === 401) return 'UNAUTHORIZED';
    if (status >= 400) return 'BAD_REQUEST';
    return 'UNKNOWN_ERROR';
  }

  /**
   * セキュリティエラーの特別処理
   */
  handleSecurityError(error: EnhancedError, req: Request): {
    status: number;
    response: any;
    logData: any;
  } {
    error.category = ErrorCategory.SECURITY;
    error.severity = ErrorSeverity.CRITICAL;
    error.sensitive = true;

    // セキュリティログに記録
    enhancedSecurityLogger.log(
      EnhancedSecurityLogLevel.CRITICAL,
      EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC,
      `Security error: ${error.message}`,
      {
        userId: error.userId,
        sessionId: error.sessionId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method
      },
      {
        errorCode: error.code,
        category: error.category,
        correlationId: error.correlationId
      }
    );

    return this.handleError(error, req);
  }

  /**
   * エラー統計の取得
   */
  getErrorStats() {
    return this.statsTracker.getStats();
  }

  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<ErrorHandlingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 設定の取得
   */
  getConfig(): ErrorHandlingConfig {
    return { ...this.config };
  }
}

// シングルトンインスタンス
export const enhancedErrorHandler = new EnhancedErrorHandler();

/**
 * Express用エラーハンドリングミドルウェア
 */
export function enhancedErrorMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { status, response, logData } = enhancedErrorHandler.handleError(error, req);

    // ログ記録
    console.error('Enhanced Error Handler:', logData);

    // レスポンス送信
    if (!res.headersSent) {
      res.status(status).json(response);
    }
  } catch (handlingError) {
    console.error('Error in error handler:', handlingError);
    
    // フォールバック応答
    if (!res.headersSent) {
      res.status(500).json({
        error: true,
        message: 'サーバーでエラーが発生しました。',
        timestamp: new Date().toISOString()
      });
    }
  }
}