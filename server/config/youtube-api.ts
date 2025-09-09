/**
 * YouTube Data API v3設定
 * 公式APIを使用したYouTube動画情報取得
 */

interface YouTubeAPIConfig {
  readonly quotas: {
    readonly dailyLimit: number;
    readonly costPerRequest: {
      readonly videoDetails: number;
      readonly captions: number;
      readonly search: number;
    };
  };
  readonly rateLimit: {
    readonly requestsPerSecond: number;
    readonly requestsPerMinute: number;
    readonly requestsPerHour: number;
  };
  readonly urls: {
    readonly baseUrl: string;
    readonly videoEndpoint: string;
    readonly captionsEndpoint: string;
  };
}

/**
 * YouTube Data API v3の制限と設定
 */
export const YOUTUBE_API_CONFIG: YouTubeAPIConfig = {
  quotas: {
    dailyLimit: 10000, // デフォルトの1日の割り当て
    costPerRequest: {
      videoDetails: 1, // videos.list
      captions: 50, // captions.list + captions.download
      search: 100, // search.list
    },
  },
  rateLimit: {
    requestsPerSecond: 10, // 安全な制限
    requestsPerMinute: 300, // 1分あたり
    requestsPerHour: 5000, // 1時間あたり
  },
  urls: {
    baseUrl: 'https://www.googleapis.com/youtube/v3',
    videoEndpoint: '/videos',
    captionsEndpoint: '/captions',
  },
};

/**
 * API使用量計算
 */
export class YouTubeAPIQuotaManager {
  private dailyUsage: number = 0;
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  /**
   * 1日の使用量をリセット
   */
  private resetDailyUsageIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      this.dailyUsage = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * APIコストを追加
   */
  addUsage(cost: number): void {
    this.resetDailyUsageIfNeeded();
    this.dailyUsage += cost;
  }

  /**
   * 残り使用量を取得
   */
  getRemainingQuota(): number {
    this.resetDailyUsageIfNeeded();
    return Math.max(0, YOUTUBE_API_CONFIG.quotas.dailyLimit - this.dailyUsage);
  }

  /**
   * API呼び出し可能かチェック
   */
  canMakeRequest(cost: number): boolean {
    return this.getRemainingQuota() >= cost;
  }

  /**
   * 現在の使用量統計
   */
  getUsageStats(): { dailyUsage: number; remainingQuota: number; utilizationPercent: number } {
    this.resetDailyUsageIfNeeded();
    const remaining = this.getRemainingQuota();
    const utilization = (this.dailyUsage / YOUTUBE_API_CONFIG.quotas.dailyLimit) * 100;
    
    return {
      dailyUsage: this.dailyUsage,
      remainingQuota: remaining,
      utilizationPercent: Math.round(utilization * 100) / 100,
    };
  }
}

/**
 * グローバルクォータマネージャー
 */
export const quotaManager = new YouTubeAPIQuotaManager();

/**
 * API呼び出しレート制限
 */
export class YouTubeAPIRateLimiter {
  private requestTimes: number[] = [];

  /**
   * レート制限チェック
   */
  async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const oneMinuteAgo = now - 60000;

    // 古いリクエストタイムスタンプを削除
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

    // 1秒間の制限チェック
    const recentRequests = this.requestTimes.filter(time => time > oneSecondAgo);
    if (recentRequests.length >= YOUTUBE_API_CONFIG.rateLimit.requestsPerSecond) {
      const waitTime = 1000 - (now - recentRequests[0]);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 1分間の制限チェック
    if (this.requestTimes.length >= YOUTUBE_API_CONFIG.rateLimit.requestsPerMinute) {
      const waitTime = 60000 - (now - this.requestTimes[0]);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 現在のリクエストを記録
    this.requestTimes.push(now);
  }
}

/**
 * グローバルレート制限マネージャー
 */
export const rateLimiter = new YouTubeAPIRateLimiter();