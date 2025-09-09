/**
 * 統合エラーハンドリングシステム
 * 全エラーハンドリングコンポーネントを統合した包括的なシステム
 */

import { Request, Response, NextFunction } from 'express';
import { 
  enhancedErrorHandler, 
  EnhancedError, 
  ErrorCategory, 
  ErrorSeverity,
  ErrorDisclosureLevel
} from './enhancedErrorHandling';
import { userFriendlyErrorPages } from './userFriendlyErrorPages';
import { errorTrackingSystem } from '../utils/errorTrackingSystem';
import { enhancedSecurityLogger, EnhancedSecurityLogLevel, EnhancedSecurityEventType } from '../utils/enhancedSecurityLogger';

// 統合エラーレスポンスインターフェース
interface UnifiedErrorResponse {
  clientResponse: any;
  status: number;
  correlationId: string;
  isApiRequest: boolean;
  htmlContent?: string;
}

// エラー処理設定
interface ErrorProcessingConfig {
  enableTracking: boolean;
  enableSecurityLogging: boolean;
  enableUserFriendlyPages: boolean;
  enableEnhancedHandling: boolean;
  forceApiResponse: boolean;
  customResponseHeaders: Record<string, string>;
}

/**
 * リクエスト分析器
 */
class RequestAnalyzer {
  /**
   * APIリクエストかどうかの判定
   */
  static isApiRequest(req: Request): boolean {
    // パス判定
    if (req.path.startsWith('/api/')) {
      return true;
    }

    // Accept ヘッダー判定
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('application/json')) {
      return true;
    }

    // Content-Type ヘッダー判定
    const contentType = req.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      return true;
    }

    // User-Agent判定（API クライアント検出）
    const userAgent = req.get('User-Agent') || '';
    const apiUserAgents = [
      /curl/i, /wget/i, /postman/i, /insomnia/i,
      /python-requests/i, /node-fetch/i, /axios/i,
      /okhttp/i, /apache-httpclient/i
    ];
    
    if (apiUserAgents.some(pattern => pattern.test(userAgent))) {
      return true;
    }

    // X-Requested-With ヘッダー判定
    if (req.get('X-Requested-With') === 'XMLHttpRequest') {
      return true;
    }

    return false;
  }

  /**
   * エラーカテゴリの拡張判定
   */
  static enhanceErrorCategory(error: Error, req: Request): ErrorCategory {
    const message = error.message.toLowerCase();
    const path = req.path.toLowerCase();

    // パス別カテゴリ判定
    if (path.includes('/auth') || path.includes('/login') || path.includes('/register')) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    if (path.includes('/admin') || path.includes('/manage')) {
      return ErrorCategory.AUTHORIZATION;
    }

    if (path.includes('/upload') || path.includes('/file')) {
      return ErrorCategory.VALIDATION;
    }

    // エラーメッセージベース判定
    if (message.includes('quota') || message.includes('limit') || message.includes('rate')) {
      return ErrorCategory.BUSINESS_LOGIC;
    }

    if (message.includes('network') || message.includes('dns') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }

    // デフォルトカテゴリロジック（既存のロジックを使用）
    return ErrorCategory.UNKNOWN;
  }

  /**
   * セキュリティ関連エラーの判定
   */
  static isSecurityRelatedError(error: Error, req: Request): boolean {
    const message = error.message.toLowerCase();
    const path = req.path.toLowerCase();
    const userAgent = req.get('User-Agent') || '';

    // 明らかなセキュリティエラー
    const securityKeywords = [
      'csrf', 'xss', 'injection', 'sql', 'script', 'unauthorized',
      'forbidden', 'invalid token', 'authentication failed',
      'permission denied', 'access denied', 'security'
    ];

    if (securityKeywords.some(keyword => message.includes(keyword))) {
      return true;
    }

    // 怪しいパスへのアクセス
    const suspiciousPaths = [
      '/.env', '/admin', '/.git', '/config', '/backup',
      '/phpmyadmin', '/wp-admin', '/debug'
    ];

    if (suspiciousPaths.some(suspiciousPath => path.includes(suspiciousPath))) {
      return true;
    }

    // 怪しいUser-Agent
    const suspiciousUserAgents = [
      /sqlmap/i, /nikto/i, /nmap/i, /burp/i, /dirb/i,
      /scanner/i, /exploit/i, /hack/i, /bot.*security/i
    ];

    if (suspiciousUserAgents.some(pattern => pattern.test(userAgent))) {
      return true;
    }

    return false;
  }
}

/**
 * レスポンス生成器
 */
class ResponseGenerator {
  /**
   * 統合レスポンスの生成
   */
  static async generateUnifiedResponse(
    error: EnhancedError,
    req: Request,
    config: ErrorProcessingConfig
  ): Promise<UnifiedErrorResponse> {
    const isApiRequest = config.forceApiResponse || RequestAnalyzer.isApiRequest(req);
    const correlationId = error.correlationId || `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 基本エラー情報を拡張
    const enhancedError: EnhancedError = {
      ...error,
      correlationId,
      category: error.category || RequestAnalyzer.enhanceErrorCategory(error, req),
      severity: error.severity || this.determineSeverity(error),
      userId: (req as any).user?.id,
      sessionId: req.sessionID
    };

    // 拡張エラーハンドラーで処理
    const { status, response } = enhancedErrorHandler.handleError(enhancedError, req);

    let htmlContent: string | undefined;
    let clientResponse = response;

    if (!isApiRequest && config.enableUserFriendlyPages) {
      // HTMLレスポンス生成
      htmlContent = userFriendlyErrorPages.generateErrorPage(
        req, 
        status, 
        correlationId,
        enhancedError.message
      );
    } else {
      // APIレスポンスを調整
      clientResponse = userFriendlyErrorPages.generateApiErrorResponse(
        req,
        status,
        correlationId,
        enhancedError.message
      );
    }

    return {
      clientResponse,
      status,
      correlationId,
      isApiRequest,
      htmlContent
    };
  }

  private static determineSeverity(error: EnhancedError): ErrorSeverity {
    const status = error.status || error.statusCode || 500;
    
    if (status >= 500) return ErrorSeverity.HIGH;
    if (status === 429) return ErrorSeverity.MEDIUM;
    if (status >= 400) return ErrorSeverity.LOW;
    
    return ErrorSeverity.MEDIUM;
  }
}

/**
 * 統合ログ処理
 */
class UnifiedLogger {
  /**
   * 包括的なエラーログ処理
   */
  static async logError(
    error: EnhancedError,
    req: Request,
    response: UnifiedErrorResponse,
    config: ErrorProcessingConfig
  ): Promise<void> {
    // 基本ログ
    console.error('Unified Error Handler:', {
      correlationId: response.correlationId,
      error: {
        name: error.name,
        message: error.message,
        category: error.category,
        severity: error.severity
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      response: {
        status: response.status,
        isApiRequest: response.isApiRequest
      }
    });

    // セキュリティログ
    if (config.enableSecurityLogging && RequestAnalyzer.isSecurityRelatedError(error, req)) {
      const logLevel = this.getSecurityLogLevel(error.severity!);
      const eventType = this.getSecurityEventType(error.category!);

      enhancedSecurityLogger.log(
        logLevel,
        eventType,
        `Security-related error: ${error.message}`,
        {
          userId: error.userId,
          sessionId: error.sessionId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method
        },
        {
          errorCategory: error.category,
          errorSeverity: error.severity,
          correlationId: response.correlationId,
          status: response.status
        }
      );
    }

    // エラートラッキング
    if (config.enableTracking) {
      await errorTrackingSystem.trackError(
        error,
        {
          method: req.method,
          path: req.path,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          headers: req.headers,
          query: req.query,
          params: req.params,
          body: req.body
        },
        {
          id: error.userId,
          sessionId: error.sessionId
        }
      );
    }
  }

  private static getSecurityLogLevel(severity: ErrorSeverity): EnhancedSecurityLogLevel {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return EnhancedSecurityLogLevel.CRITICAL;
      case ErrorSeverity.HIGH: return EnhancedSecurityLogLevel.ERROR;
      case ErrorSeverity.MEDIUM: return EnhancedSecurityLogLevel.WARNING;
      case ErrorSeverity.LOW: return EnhancedSecurityLogLevel.INFO;
      default: return EnhancedSecurityLogLevel.WARNING;
    }
  }

  private static getSecurityEventType(category: ErrorCategory): EnhancedSecurityEventType {
    switch (category) {
      case ErrorCategory.AUTHENTICATION: return EnhancedSecurityEventType.AUTH_FAILURE;
      case ErrorCategory.AUTHORIZATION: return EnhancedSecurityEventType.ACCESS_CONTROL_VIOLATION;
      case ErrorCategory.SECURITY: return EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC;
      case ErrorCategory.VALIDATION: return EnhancedSecurityEventType.XSS_ATTEMPT;
      default: return EnhancedSecurityEventType.ABNORMAL_TRAFFIC;
    }
  }
}

/**
 * メインの統合エラーハンドラー
 */
export class UnifiedErrorHandler {
  private config: ErrorProcessingConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): ErrorProcessingConfig {
    return {
      enableTracking: process.env.ENABLE_ERROR_TRACKING !== 'false',
      enableSecurityLogging: process.env.ENABLE_SECURITY_ERROR_LOGGING !== 'false',
      enableUserFriendlyPages: process.env.ENABLE_USER_FRIENDLY_PAGES !== 'false',
      enableEnhancedHandling: process.env.ENABLE_ENHANCED_ERROR_HANDLING !== 'false',
      forceApiResponse: process.env.FORCE_API_ERROR_RESPONSE === 'true',
      customResponseHeaders: this.parseCustomHeaders()
    };
  }

  private parseCustomHeaders(): Record<string, string> {
    const headersEnv = process.env.CUSTOM_ERROR_RESPONSE_HEADERS;
    if (!headersEnv) return {};

    try {
      return JSON.parse(headersEnv);
    } catch {
      return {};
    }
  }

  /**
   * メインエラー処理メソッド
   */
  async handleError(error: any, req: Request, res: Response): Promise<void> {
    try {
      // エラーオブジェクトの正規化
      const enhancedError = this.normalizeError(error, req);
      
      // 統合レスポンス生成
      const unifiedResponse = await ResponseGenerator.generateUnifiedResponse(
        enhancedError,
        req,
        this.config
      );

      // ログ処理
      await UnifiedLogger.logError(enhancedError, req, unifiedResponse, this.config);

      // レスポンス送信
      await this.sendResponse(res, unifiedResponse);

    } catch (handlingError) {
      console.error('Critical error in unified error handler:', handlingError);
      await this.sendFallbackResponse(res, error);
    }
  }

  private normalizeError(error: any, req: Request): EnhancedError {
    if (typeof error === 'string') {
      error = new Error(error);
    }

    if (!(error instanceof Error)) {
      error = new Error('Unknown error occurred');
    }

    return {
      name: error.name || 'Error',
      message: error.message || 'An error occurred',
      stack: error.stack,
      status: error.status || error.statusCode,
      code: error.code,
      category: error.category,
      severity: error.severity,
      userId: error.userId || (req as any).user?.id,
      sessionId: error.sessionId || req.sessionID,
      correlationId: error.correlationId,
      details: error.details,
      originalError: error.originalError || error,
      sensitive: error.sensitive || RequestAnalyzer.isSecurityRelatedError(error, req)
    };
  }

  private async sendResponse(res: Response, unifiedResponse: UnifiedErrorResponse): Promise<void> {
    if (res.headersSent) {
      return; // レスポンスが既に送信済み
    }

    // カスタムヘッダーの設定
    Object.entries(this.config.customResponseHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // セキュリティヘッダー
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Correlation-ID', unifiedResponse.correlationId);

    if (unifiedResponse.isApiRequest || !unifiedResponse.htmlContent) {
      // JSON レスポンス
      res.status(unifiedResponse.status)
         .type('application/json')
         .json(unifiedResponse.clientResponse);
    } else {
      // HTML レスポンス
      res.status(unifiedResponse.status)
         .type('text/html')
         .send(unifiedResponse.htmlContent);
    }
  }

  private async sendFallbackResponse(res: Response, originalError: any): Promise<void> {
    if (res.headersSent) {
      return;
    }

    const fallbackResponse = {
      error: true,
      message: 'サーバーでエラーが発生しました。',
      correlationId: `fallback-${Date.now()}`,
      timestamp: new Date().toISOString()
    };

    try {
      res.status(500).json(fallbackResponse);
    } catch (sendError) {
      console.error('Failed to send fallback response:', sendError);
    }
  }

  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<ErrorProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 現在の設定取得
   */
  getConfig(): ErrorProcessingConfig {
    return { ...this.config };
  }

  /**
   * エラー統計の取得
   */
  async getErrorStats(hoursBack: number = 24) {
    return await errorTrackingSystem.generateStats(hoursBack);
  }

  /**
   * エラーパターンの検出
   */
  async detectErrorPatterns(hoursBack: number = 24) {
    return await errorTrackingSystem.detectErrorPatterns(hoursBack);
  }

  /**
   * ダッシュボードデータの取得
   */
  async getDashboardData() {
    return await errorTrackingSystem.getDashboardData();
  }
}

// シングルトンインスタンス
export const unifiedErrorHandler = new UnifiedErrorHandler();

/**
 * Express ミドルウェア関数
 */
export function unifiedErrorMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 非同期処理だが、Expressのエラーハンドリングの仕様に合わせる
  unifiedErrorHandler.handleError(error, req, res).catch(criticalError => {
    console.error('Critical error in unified error middleware:', criticalError);
    
    // 最後の手段として基本的なレスポンスを送信
    if (!res.headersSent) {
      res.status(500).json({
        error: true,
        message: 'サーバーでエラーが発生しました。',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * カスタムエラー作成ヘルパー
 */
export function createError(
  message: string,
  status: number = 500,
  options: {
    code?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    details?: any;
    sensitive?: boolean;
  } = {}
): EnhancedError {
  const error = new Error(message) as EnhancedError;
  error.status = status;
  error.code = options.code;
  error.category = options.category;
  error.severity = options.severity;
  error.details = options.details;
  error.sensitive = options.sensitive;
  
  return error;
}

/**
 * 非同期エラーキャッチヘルパー
 */
export function asyncErrorCatcher(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}