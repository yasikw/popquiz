/**
 * 包括的セキュリティ監視システム
 * 全監視項目を統合した包括的なセキュリティ監視ミドルウェア
 */

import { Request, Response, NextFunction } from 'express';
import { enhancedSecurityLogger, EnhancedSecurityLogLevel, EnhancedSecurityEventType } from '../utils/enhancedSecurityLogger';
import { securityAnomalyDetector } from '../utils/securityAnomalyDetector';
import { realTimeAlertSystem } from '../utils/realTimeAlertSystem';

// 拡張リクエストインターフェース
interface ExtendedRequest extends Request {
  securityContext?: SecurityRequestContext;
  user?: any;
}

// リクエストセキュリティコンテキスト
interface SecurityRequestContext {
  riskScore: number; // 0-100
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  flags: string[];
  sessionMetrics: {
    requestCount: number;
    errorCount: number;
    lastActivity: Date;
    suspiciousPatterns: string[];
  };
}

// セキュリティメトリクス追跡
class SecurityMetricsTracker {
  private sessionMetrics: Map<string, any> = new Map();
  private ipMetrics: Map<string, any> = new Map();
  private userMetrics: Map<string, any> = new Map();

  /**
   * セッションメトリクスの更新
   */
  updateSessionMetrics(sessionId: string, req: ExtendedRequest, res: Response): void {
    const existing = this.sessionMetrics.get(sessionId) || {
      requestCount: 0,
      errorCount: 0,
      startTime: Date.now(),
      lastActivity: Date.now(),
      endpoints: new Set(),
      suspiciousPatterns: [],
      userAgents: new Set()
    };

    existing.requestCount++;
    existing.lastActivity = Date.now();
    existing.endpoints.add(req.path);
    if (req.get('User-Agent')) {
      existing.userAgents.add(req.get('User-Agent'));
    }

    if (res.statusCode >= 400) {
      existing.errorCount++;
    }

    this.sessionMetrics.set(sessionId, existing);
  }

  /**
   * IPアドレスメトリクスの更新
   */
  updateIPMetrics(ipAddress: string, req: ExtendedRequest): void {
    const existing = this.ipMetrics.get(ipAddress) || {
      requestCount: 0,
      uniqueEndpoints: new Set(),
      userAgents: new Set(),
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      suspiciousAttempts: 0,
      countries: new Set() // 地理的情報
    };

    existing.requestCount++;
    existing.lastSeen = Date.now();
    existing.uniqueEndpoints.add(req.path);
    if (req.get('User-Agent')) {
      existing.userAgents.add(req.get('User-Agent'));
    }

    this.ipMetrics.set(ipAddress, existing);
  }

  /**
   * ユーザーメトリクスの更新
   */
  updateUserMetrics(userId: string, req: ExtendedRequest): void {
    const existing = this.userMetrics.get(userId) || {
      sessionCount: 0,
      requestCount: 0,
      lastLogin: Date.now(),
      ipAddresses: new Set(),
      userAgents: new Set(),
      privilegeEscalationAttempts: 0,
      sensitiveDataAccess: 0
    };

    existing.requestCount++;
    if (req.ip) {
      existing.ipAddresses.add(req.ip);
    }
    if (req.get('User-Agent')) {
      existing.userAgents.add(req.get('User-Agent'));
    }

    this.userMetrics.set(userId, existing);
  }

  /**
   * リスクスコアの計算
   */
  calculateRiskScore(req: ExtendedRequest): number {
    let score = 0;
    const sessionId = req.sessionID;
    const ipAddress = req.ip;
    const userId = req.user?.id;

    // セッションベースのリスク
    const sessionData = this.sessionMetrics.get(sessionId);
    if (sessionData) {
      // 異常に多いリクエスト
      if (sessionData.requestCount > 100) score += 20;
      // エラー率が高い
      if (sessionData.errorCount / sessionData.requestCount > 0.3) score += 15;
      // 多数のエンドポイントアクセス
      if (sessionData.endpoints.size > 20) score += 10;
      // 複数のユーザーエージェント
      if (sessionData.userAgents.size > 2) score += 25;
    }

    // IPベースのリスク
    const ipData = this.ipMetrics.get(ipAddress);
    if (ipData) {
      // 短時間での大量リクエスト
      const timeSpan = Date.now() - ipData.firstSeen;
      if (timeSpan < 60000 && ipData.requestCount > 50) score += 30; // 1分で50リクエスト以上
      // 怪しい試行
      if (ipData.suspiciousAttempts > 0) score += ipData.suspiciousAttempts * 10;
    }

    // ユーザーベースのリスク
    if (userId) {
      const userData = this.userMetrics.get(userId);
      if (userData) {
        // 権限昇格試行
        if (userData.privilegeEscalationAttempts > 0) score += 40;
        // 異常な地理的アクセス
        if (userData.ipAddresses.size > 3) score += 15;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * メトリクスの取得
   */
  getMetrics(): {
    sessions: number;
    ips: number;
    users: number;
    averageRiskScore: number;
  } {
    const sessionRisks = Array.from(this.sessionMetrics.values())
      .map(data => this.calculateSessionRisk(data));
    
    return {
      sessions: this.sessionMetrics.size,
      ips: this.ipMetrics.size,
      users: this.userMetrics.size,
      averageRiskScore: sessionRisks.length > 0 ? 
        sessionRisks.reduce((a, b) => a + b, 0) / sessionRisks.length : 0
    };
  }

  private calculateSessionRisk(sessionData: any): number {
    let risk = 0;
    if (sessionData.errorCount / sessionData.requestCount > 0.2) risk += 20;
    if (sessionData.endpoints.size > 15) risk += 15;
    if (sessionData.userAgents.size > 1) risk += 10;
    return Math.min(risk, 100);
  }

  /**
   * 古いメトリクスのクリーンアップ
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24時間

    // セッションメトリクスのクリーンアップ
    for (const [sessionId, data] of this.sessionMetrics) {
      if (now - data.lastActivity > maxAge) {
        this.sessionMetrics.delete(sessionId);
      }
    }

    // IPメトリクスのクリーンアップ
    for (const [ip, data] of this.ipMetrics) {
      if (now - data.lastSeen > maxAge) {
        this.ipMetrics.delete(ip);
      }
    }
  }
}

/**
 * セキュリティ脅威検知エンジン
 */
class ThreatDetectionEngine {
  private readonly suspiciousUserAgents = [
    /sqlmap/i, /nikto/i, /dirb/i, /nmap/i, /masscan/i, /burp/i,
    /python-requests/i, /curl.*bot/i, /scanner/i, /exploit/i,
    /hack/i, /penetration/i, /vulnerability/i, /security.*test/i
  ];

  private readonly suspiciousPaths = [
    /\/\.env/i, /\/config\./i, /\/admin/i, /\/wp-admin/i, /\/\.git/i,
    /\/\.svn/i, /\/backup/i, /\/dump/i, /\/phpmyadmin/i,
    /\.\./,  /\/etc\/passwd/, /\/windows\/system32/i,
    /%2e%2e/i, /union.*select/i, /<script/i, /javascript:/i
  ];

  private readonly injectionPatterns = [
    // SQL Injection
    /(\b(select|union|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    /(\b(or|and)\s+[\w\s]*=[\w\s]*)/i,
    /(\'|\"|`|;|--|\/\*|\*\/)/,
    
    // XSS
    /<script[^>]*>.*?<\/script>/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    
    // Command Injection
    /(\||&|;|`|\$\(|\${)/,
    /(cat|ls|pwd|whoami|id|uname|nc|netcat|wget|curl|chmod|sudo)/i,
    
    // Path Traversal
    /\.\.[\/\\]/,
    /%2e%2e[%2f%5c]/i,
    /(\.\.\/){2,}/,
    
    // LDAP Injection
    /(\(|\)|&|\||!|=|\*|<|>|~)/,
    /(cn=|ou=|dc=|uid=)/i
  ];

  /**
   * 総合的な脅威検知
   */
  detectThreats(req: ExtendedRequest): {
    threats: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
  } {
    const threats: string[] = [];

    // User-Agentの検査
    const userAgent = req.get('User-Agent') || '';
    for (const pattern of this.suspiciousUserAgents) {
      if (pattern.test(userAgent)) {
        threats.push('suspicious_user_agent');
        break;
      }
    }

    // URLパスの検査
    for (const pattern of this.suspiciousPaths) {
      if (pattern.test(req.path) || pattern.test(req.url)) {
        threats.push('suspicious_path_access');
        break;
      }
    }

    // リクエストボディの検査
    if (req.body) {
      const bodyStr = JSON.stringify(req.body).toLowerCase();
      for (const pattern of this.injectionPatterns) {
        if (pattern.test(bodyStr)) {
          threats.push('injection_attempt');
          break;
        }
      }
    }

    // クエリパラメータの検査
    const queryStr = JSON.stringify(req.query).toLowerCase();
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(queryStr)) {
        threats.push('query_injection_attempt');
        break;
      }
    }

    // ヘッダーの検査
    const headers = JSON.stringify(req.headers).toLowerCase();
    if (headers.includes('script') || headers.includes('javascript')) {
      threats.push('header_injection');
    }

    // ファイルアップロードの検査
    if (req.files || (req.body && typeof req.body === 'object' && 'filename' in req.body)) {
      threats.push('file_upload_attempt');
    }

    // リスクレベルの判定
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let confidence = 50;

    if (threats.length === 0) {
      riskLevel = 'low';
      confidence = 20;
    } else if (threats.includes('injection_attempt') || threats.includes('query_injection_attempt')) {
      riskLevel = 'critical';
      confidence = 95;
    } else if (threats.includes('suspicious_user_agent') && threats.includes('suspicious_path_access')) {
      riskLevel = 'high';
      confidence = 90;
    } else if (threats.length >= 2) {
      riskLevel = 'medium';
      confidence = 75;
    } else {
      riskLevel = 'medium';
      confidence = 60;
    }

    return { threats, riskLevel, confidence };
  }

  /**
   * ボット行動の検知
   */
  detectBotBehavior(req: ExtendedRequest, sessionData: any): boolean {
    const userAgent = req.get('User-Agent') || '';
    
    // 明らかなボットパターン
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i,
      /python/i, /java/i, /go-http/i, /okhttp/i
    ];

    // User-Agentがボットパターンにマッチ
    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      return true;
    }

    // セッションデータからボット行動を検知
    if (sessionData) {
      // 異常に高速なリクエスト
      const timeSpan = Date.now() - sessionData.startTime;
      if (timeSpan > 0 && sessionData.requestCount / (timeSpan / 1000) > 5) { // 5RPS以上
        return true;
      }

      // 線形的なエンドポイントアクセス
      if (sessionData.endpoints.size > 10 && sessionData.errorCount === 0) {
        return true;
      }

      // User-Agentの欠如または異常
      if (!userAgent || userAgent.length < 10) {
        return true;
      }
    }

    return false;
  }
}

/**
 * セキュリティアクション実行
 */
class SecurityActionExecutor {
  /**
   * 自動ブロック処理
   */
  async executeAutoBlock(req: ExtendedRequest, res: Response, reason: string): Promise<boolean> {
    try {
      const ipAddress = req.ip;
      const userId = req.user?.id;

      // セキュリティログに記録
      enhancedSecurityLogger.log(
        EnhancedSecurityLogLevel.CRITICAL,
        EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC,
        `Auto-blocked due to: ${reason}`,
        {
          ipAddress,
          userId,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method
        },
        {
          blockReason: reason,
          action: 'auto_block',
          timestamp: new Date().toISOString()
        }
      );

      // ここで実際のブロック処理を実装
      // 例: IPをブラックリストに追加、レート制限の強化など

      return true;
    } catch (error) {
      console.error('Error executing auto-block:', error);
      return false;
    }
  }

  /**
   * アラート送信
   */
  async sendSecurityAlert(req: ExtendedRequest, threats: string[], riskLevel: string): Promise<void> {
    try {
      const alertData = {
        timestamp: new Date().toISOString(),
        ipAddress: req.ip,
        userId: req.user?.id,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
        threats,
        riskLevel,
        sessionId: req.sessionID
      };

      // リアルタイムアラートシステムに送信
      realTimeAlertSystem.emit('securityThreatDetected', alertData);

    } catch (error) {
      console.error('Error sending security alert:', error);
    }
  }

  /**
   * セキュリティヘッダーの追加
   */
  addSecurityHeaders(res: Response, riskLevel: string): void {
    // リスクレベルに応じてセキュリティヘッダーを調整
    if (riskLevel === 'high' || riskLevel === 'critical') {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
  }
}

/**
 * メインの包括的セキュリティ監視ミドルウェア
 */
export class ComprehensiveSecurityMonitoring {
  private metricsTracker: SecurityMetricsTracker;
  private threatDetection: ThreatDetectionEngine;
  private actionExecutor: SecurityActionExecutor;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.metricsTracker = new SecurityMetricsTracker();
    this.threatDetection = new ThreatDetectionEngine();
    this.actionExecutor = new SecurityActionExecutor();

    // 定期的なクリーンアップ（1時間ごと）
    this.cleanupInterval = setInterval(() => {
      this.metricsTracker.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * メインのミドルウェア関数
   */
  middleware = async (req: ExtendedRequest, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();

    try {
      // 1. メトリクス更新
      const sessionId = req.sessionID || 'anonymous';
      const ipAddress = req.ip || 'unknown';
      const userId = req.user?.id;

      this.metricsTracker.updateSessionMetrics(sessionId, req, res);
      this.metricsTracker.updateIPMetrics(ipAddress, req);
      if (userId) {
        this.metricsTracker.updateUserMetrics(userId, req);
      }

      // 2. 脅威検知
      const threatAnalysis = this.threatDetection.detectThreats(req);
      const riskScore = this.metricsTracker.calculateRiskScore(req);

      // 3. セキュリティコンテキストの設定
      req.securityContext = {
        riskScore,
        threatLevel: threatAnalysis.riskLevel,
        flags: threatAnalysis.threats,
        sessionMetrics: {
          requestCount: 0,
          errorCount: 0,
          lastActivity: new Date(),
          suspiciousPatterns: threatAnalysis.threats
        }
      };

      // 4. ボット検知
      const sessionData = this.metricsTracker['sessionMetrics'].get(sessionId);
      const isBot = this.threatDetection.detectBotBehavior(req, sessionData);
      if (isBot) {
        req.securityContext.flags.push('bot_behavior');
      }

      // 5. セキュリティログの記録
      enhancedSecurityLogger.log(
        this.getLogLevelFromRisk(riskScore, threatAnalysis.riskLevel),
        this.getEventTypeFromThreats(threatAnalysis.threats),
        `Security monitoring: ${threatAnalysis.threats.length} threats detected`,
        {
          userId,
          sessionId,
          ipAddress,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method,
          threat: {
            level: threatAnalysis.riskLevel,
            indicators: threatAnalysis.threats,
            confidence: threatAnalysis.confidence
          }
        },
        {
          riskScore,
          threats: threatAnalysis.threats,
          isBot,
          sessionMetrics: sessionData ? {
            requestCount: sessionData.requestCount,
            errorRate: sessionData.requestCount > 0 ? sessionData.errorCount / sessionData.requestCount : 0
          } : undefined
        }
      );

      // 6. 異常検知システムによる分析
      const logEntry = {
        id: 'temp-id',
        timestamp: new Date().toISOString(),
        level: this.getLogLevelFromRisk(riskScore, threatAnalysis.riskLevel),
        eventType: this.getEventTypeFromThreats(threatAnalysis.threats),
        message: 'Security monitoring analysis',
        context: {
          userId,
          sessionId,
          ipAddress,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method,
          threat: {
            level: threatAnalysis.riskLevel,
            indicators: threatAnalysis.threats,
            confidence: threatAnalysis.confidence
          }
        },
        metadata: { riskScore, threats: threatAnalysis.threats },
        correlationId: sessionId,
        tags: ['security-monitoring'],
        hash: 'temp-hash'
      };

      // 異常検知の実行
      securityAnomalyDetector.analyzeLogEntry(logEntry);

      // 7. 自動アクション
      await this.executeAutomaticActions(req, res, threatAnalysis, riskScore);

      // 8. セキュリティヘッダーの追加
      this.actionExecutor.addSecurityHeaders(res, threatAnalysis.riskLevel);

      // 9. レスポンス時間の記録
      res.on('finish', () => {
        const processingTime = Date.now() - startTime;
        if (processingTime > 5000) { // 5秒以上の処理時間
          enhancedSecurityLogger.log(
            EnhancedSecurityLogLevel.WARNING,
            EnhancedSecurityEventType.ABNORMAL_TRAFFIC,
            'Slow response time detected',
            { ipAddress, endpoint: req.path },
            { processingTime }
          );
        }
      });

      next();

    } catch (error) {
      console.error('Error in comprehensive security monitoring:', error);
      next(); // エラーが発生してもリクエスト処理は継続
    }
  };

  private async executeAutomaticActions(
    req: ExtendedRequest, 
    res: Response, 
    threatAnalysis: any, 
    riskScore: number
  ): Promise<void> {
    // 自動ブロック条件
    if (riskScore > 80 || threatAnalysis.riskLevel === 'critical') {
      await this.actionExecutor.executeAutoBlock(req, res, 'High risk score or critical threats');
    }

    // アラート送信条件
    if (riskScore > 60 || threatAnalysis.threats.length > 2) {
      await this.actionExecutor.sendSecurityAlert(req, threatAnalysis.threats, threatAnalysis.riskLevel);
    }
  }

  private getLogLevelFromRisk(riskScore: number, riskLevel: string): EnhancedSecurityLogLevel {
    if (riskLevel === 'critical' || riskScore > 80) return EnhancedSecurityLogLevel.CRITICAL;
    if (riskLevel === 'high' || riskScore > 60) return EnhancedSecurityLogLevel.ERROR;
    if (riskLevel === 'medium' || riskScore > 30) return EnhancedSecurityLogLevel.WARNING;
    return EnhancedSecurityLogLevel.INFO;
  }

  private getEventTypeFromThreats(threats: string[]): EnhancedSecurityEventType {
    if (threats.includes('injection_attempt') || threats.includes('query_injection_attempt')) {
      return EnhancedSecurityEventType.SQL_INJECTION_ATTEMPT;
    }
    if (threats.includes('header_injection')) {
      return EnhancedSecurityEventType.XSS_ATTEMPT;
    }
    if (threats.includes('suspicious_path_access')) {
      return EnhancedSecurityEventType.PATH_TRAVERSAL_ATTEMPT;
    }
    if (threats.includes('bot_behavior')) {
      return EnhancedSecurityEventType.ABNORMAL_TRAFFIC;
    }
    return EnhancedSecurityEventType.SUSPICIOUS_TRAFFIC;
  }

  /**
   * 監視統計の取得
   */
  getMonitoringStats(): any {
    return this.metricsTracker.getMetrics();
  }

  /**
   * システム終了時のクリーンアップ
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// シングルトンインスタンス
export const comprehensiveSecurityMonitoring = new ComprehensiveSecurityMonitoring();

// Express ミドルウェア関数
export const comprehensiveSecurityMiddleware = comprehensiveSecurityMonitoring.middleware;