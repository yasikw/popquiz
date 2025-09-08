/**
 * SafeCache - メモリリーク脆弱性対策済みキャッシュシステム
 * TTL機能、サイズ制限、自動クリーンアップを提供
 */

interface CacheItem {
  data: string;
  timestamp: number;
}

export class SafeCache {
  private cache: Map<string, CacheItem> = new Map();
  private readonly TTL: number;
  private readonly MAX_SIZE: number;
  private readonly CLEANUP_PERCENTAGE = 0.2; // クリーンアップ時に削除する割合（20%）

  constructor(options?: { ttl?: number; maxSize?: number }) {
    // 本番環境では長めのTTLと大きめのキャッシュサイズを使用
    const isProduction = process.env.NODE_ENV === 'production';
    
    this.TTL = options?.ttl || (isProduction ? 7200000 : 3600000); // 本番: 2時間, 開発: 1時間
    this.MAX_SIZE = options?.maxSize || (isProduction ? 200 : 100); // 本番: 200, 開発: 100
  }

  /**
   * キャッシュにデータを設定
   * @param key キー
   * @param value 値
   */
  set(key: string, value: string): void {
    // サイズ制限チェックとクリーンアップ
    if (this.cache.size >= this.MAX_SIZE) {
      this.performCleanup();
    }

    const cacheItem: CacheItem = {
      data: value,
      timestamp: Date.now()
    };

    this.cache.set(key, cacheItem);
  }

  /**
   * キャッシュからデータを取得
   * @param key キー
   * @returns データまたはundefined（期限切れまたは存在しない場合）
   */
  get(key: string): string | undefined {
    const item = this.cache.get(key);
    
    if (!item) {
      return undefined;
    }

    // TTLチェック
    const now = Date.now();
    if (now - item.timestamp > this.TTL) {
      // 期限切れのアイテムを削除
      this.cache.delete(key);
      return undefined;
    }

    return item.data;
  }

  /**
   * キャッシュを完全にクリア
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 現在のキャッシュサイズを取得
   * @returns キャッシュ内のエントリ数
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 期限切れエントリの手動クリーンアップ
   * @returns 削除されたエントリ数
   */
  cleanupExpired(): number {
    const now = Date.now();
    let deletedCount = 0;

    this.cache.forEach((item, key) => {
      if (now - item.timestamp > this.TTL) {
        this.cache.delete(key);
        deletedCount++;
      }
    });

    return deletedCount;
  }

  /**
   * サイズ超過時の自動クリーンアップ
   * 古いエントリから20%を削除
   */
  private performCleanup(): void {
    // まず期限切れアイテムをクリーンアップ
    this.cleanupExpired();

    // まだサイズ制限を超えている場合、古いエントリから削除
    if (this.cache.size >= this.MAX_SIZE) {
      const entriesToDelete = Math.ceil(this.cache.size * this.CLEANUP_PERCENTAGE);
      
      // エントリをタイムスタンプでソート（古い順）
      const entries: [string, CacheItem][] = [];
      this.cache.forEach((value, key) => {
        entries.push([key, value]);
      });
      
      const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // 古いエントリから指定数削除
      for (let i = 0; i < entriesToDelete && i < sortedEntries.length; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }

  /**
   * キャッシュの統計情報を取得
   * @returns 統計情報オブジェクト
   */
  getStats(): {
    size: number;
    maxSize: number;
    ttl: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    const now = Date.now();
    let oldest: number | null = null;
    let newest: number | null = null;

    this.cache.forEach((item) => {
      if (oldest === null || item.timestamp < oldest) {
        oldest = item.timestamp;
      }
      if (newest === null || item.timestamp > newest) {
        newest = item.timestamp;
      }
    });

    return {
      size: this.cache.size,
      maxSize: this.MAX_SIZE,
      ttl: this.TTL,
      oldestEntry: oldest ? now - oldest : null,
      newestEntry: newest ? now - newest : null
    };
  }
}

// シングルトンインスタンスをエクスポート
export const safeCache = new SafeCache();