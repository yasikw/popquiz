/**
 * YouTube API監視・アラートミドルウェア
 * レート制限、クォータ使用量、エラーレートの監視
 */

import { Request, Response, NextFunction } from 'express';
import { quotaManager, rateLimiter } from '../config/youtube-api';
import { securityLogger } from '../utils/securityLogger';

/**
 * API使用量統計
 */
interface APIUsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  quotaUsage: number;
  errorRate: number;
  lastResetTime: string;
}

/**
 * YouTube API監視クラス
 */
class YouTubeAPIMonitor {
  private stats: APIUsageStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    quotaUsage: 0,
    errorRate: 0,
    lastResetTime: new Date().toISOString(),
  };

  private readonly QUOTA_WARNING_THRESHOLD = 0.8; // 80%で警告
  private readonly QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%で重要アラート
  private readonly ERROR_RATE_THRESHOLD = 0.3; // 30%以上のエラー率で警告

  /**
   * API呼び出し前の監視
   */
  async beforeAPICall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 現在の使用量統計を更新
      this.updateStats();

      // クォータ制限チェック
      const quotaStats = quotaManager.getUsageStats();
      const quotaUtilization = quotaStats.utilizationPercent / 100;

      if (quotaUtilization >= this.QUOTA_CRITICAL_THRESHOLD) {
        securityLogger.log(
          'ERROR' as const,
          'YOUTUBE_QUOTA_CRITICAL',
          'YouTube API quota critically high',
          {
            currentUsage: quotaStats.dailyUsage,
            remainingQuota: quotaStats.remainingQuota,
            utilizationPercent: quotaStats.utilizationPercent,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
          }
        );

        res.status(503).json({
          error: 'Service Temporarily Unavailable',
          message: 'YouTube APIの1日の使用量上限に近づいています。しばらく時間をおいてからお試しください。',
          retryAfter: this.getTimeUntilReset(),
        });
        return;
      }

      if (quotaUtilization >= this.QUOTA_WARNING_THRESHOLD) {
        securityLogger.log(
          'WARN' as const,
          'YOUTUBE_QUOTA_WARNING',
          'YouTube API quota usage high',
          {
            currentUsage: quotaStats.dailyUsage,
            remainingQuota: quotaStats.remainingQuota,
            utilizationPercent: quotaStats.utilizationPercent,
          }
        );
      }

      // エラー率チェック
      if (this.stats.errorRate >= this.ERROR_RATE_THRESHOLD && this.stats.totalRequests > 10) {
        securityLogger.log(
          'WARN' as const,
          'YOUTUBE_ERROR_RATE_HIGH',
          'YouTube API error rate is high',
          {
            errorRate: this.stats.errorRate,
            totalRequests: this.stats.totalRequests,
            failedRequests: this.stats.failedRequests,
          }
        );
      }

      // レート制限チェック
      await rateLimiter.checkRateLimit();

      // リクエスト数を記録
      this.stats.totalRequests++;

      next();
    } catch (error) {
      console.error('YouTube API monitoring error:', error);
      res.status(500).json({
        error: 'Monitoring Error',
        message: 'APIモニタリングでエラーが発生しました',
      });
    }
  }

  /**
   * API呼び出し後の結果監視
   */
  afterAPICall(success: boolean, quotaUsed: number = 0): void {
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    this.stats.quotaUsage += quotaUsed;
    this.updateErrorRate();

    // 異常な失敗率の場合はログ記録
    if (this.stats.errorRate >= this.ERROR_RATE_THRESHOLD && this.stats.totalRequests > 5) {
      securityLogger.log(
        'ERROR' as const,
        'YOUTUBE_API_DEGRADED',
        'YouTube API service appears degraded',
        {
          errorRate: this.stats.errorRate,
          recentRequests: this.stats.totalRequests,
          recentFailures: this.stats.failedRequests,
        }
      );
    }
  }

  /**
   * 統計の更新
   */
  private updateStats(): void {
    const now = new Date();
    const lastReset = new Date(this.stats.lastResetTime);
    
    // 1時間ごとに統計をリセット
    if (now.getTime() - lastReset.getTime() > 60 * 60 * 1000) {
      this.resetStats();
    }
  }

  /**
   * エラー率の計算
   */
  private updateErrorRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.errorRate = this.stats.failedRequests / this.stats.totalRequests;
    }
  }

  /**
   * 統計のリセット
   */
  private resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      quotaUsage: 0,
      errorRate: 0,
      lastResetTime: new Date().toISOString(),
    };
  }

  /**
   * 次のリセット時刻までの秒数
   */
  private getTimeUntilReset(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(8, 0, 0, 0); // 太平洋時間の午前0時 = UTC午前8時
    
    return Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
  }

  /**
   * 現在の統計を取得
   */
  getStats(): APIUsageStats & { quotaStats: any } {
    return {
      ...this.stats,
      quotaStats: quotaManager.getUsageStats(),
    };
  }

  /**
   * ヘルスチェック
   */
  getHealthStatus(): { status: 'healthy' | 'warning' | 'critical'; details: any } {
    const quotaStats = quotaManager.getUsageStats();
    const quotaUtilization = quotaStats.utilizationPercent / 100;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (quotaUtilization >= this.QUOTA_CRITICAL_THRESHOLD || this.stats.errorRate >= this.ERROR_RATE_THRESHOLD) {
      status = 'critical';
    } else if (quotaUtilization >= this.QUOTA_WARNING_THRESHOLD || this.stats.errorRate >= this.ERROR_RATE_THRESHOLD * 0.7) {
      status = 'warning';
    }

    return {
      status,
      details: {
        quotaUtilization: quotaUtilization * 100,
        errorRate: this.stats.errorRate * 100,
        totalRequests: this.stats.totalRequests,
        remainingQuota: quotaStats.remainingQuota,
      },
    };
  }
}

/**
 * グローバル監視インスタンス
 */
export const youtubeMonitor = new YouTubeAPIMonitor();

/**
 * YouTube API呼び出し前の監視ミドルウェア
 */
export const beforeYouTubeAPICall = (req: Request, res: Response, next: NextFunction) => {
  youtubeMonitor.beforeAPICall(req, res, next);
};

/**
 * YouTube API結果記録用のヘルパー関数
 */
export const recordYouTubeAPIResult = (success: boolean, quotaUsed: number = 0) => {
  youtubeMonitor.afterAPICall(success, quotaUsed);
};

/**
 * YouTube API統計取得エンドポイント用
 */
export const getYouTubeAPIStats = (req: Request, res: Response) => {
  try {
    const stats = youtubeMonitor.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting YouTube API stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

/**
 * YouTube APIヘルスチェックエンドポイント用
 */
export const getYouTubeAPIHealth = (req: Request, res: Response) => {
  try {
    const health = youtubeMonitor.getHealthStatus();
    const statusCode = health.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Error getting YouTube API health:', error);
    res.status(500).json({ 
      status: 'critical', 
      error: 'Health check failed' 
    });
  }
};