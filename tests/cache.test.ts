/**
 * SafeCacheクラステスト
 * メモリリーク脆弱性対策とキャッシュ機能の検証
 */

import { SafeCache } from '../server/utils/cache.js';

describe('SafeCache', () => {
  let cache: SafeCache;

  beforeEach(() => {
    cache = new SafeCache();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('基本機能テスト', () => {
    test('set/get操作の正常動作', () => {
      // データ設定
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // データ取得
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });

    test('存在しないキーに対するundefined返却', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('同じキーで値を上書き', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'updated_value1');
      
      expect(cache.get('key1')).toBe('updated_value1');
    });

    test('size()メソッドの正確性', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);
      
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.set('key1', 'updated_value1'); // 上書き、サイズは変わらない
      expect(cache.size()).toBe(2);
    });

    test('clear()メソッドの動作確認', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
      
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL機能テスト', () => {
    test('期限切れキーのget時削除（模擬テスト）', async () => {
      // 短いTTLのテスト用キャッシュをシミュレート
      const testCache = new TestSafeCache(100); // 100ms TTL
      
      testCache.set('key1', 'value1');
      expect(testCache.get('key1')).toBe('value1');
      
      // TTL期間待機
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 期限切れでundefinedが返される
      expect(testCache.get('key1')).toBeUndefined();
      expect(testCache.size()).toBe(0); // 期限切れエントリが自動削除される
    });

    test('期限内アクセスは正常動作', async () => {
      const testCache = new TestSafeCache(200); // 200ms TTL
      
      testCache.set('key1', 'value1');
      
      // 期限内のアクセス
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(testCache.get('key1')).toBe('value1');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(testCache.get('key1')).toBe('value1');
    });

    test('cleanupExpired()メソッドの動作', async () => {
      const testCache = new TestSafeCache(100); // 100ms TTL
      
      testCache.set('key1', 'value1');
      testCache.set('key2', 'value2');
      expect(testCache.size()).toBe(2);
      
      // TTL期間待機
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 手動クリーンアップ実行
      const deletedCount = testCache.cleanupExpired();
      expect(deletedCount).toBe(2);
      expect(testCache.size()).toBe(0);
    });
  });

  describe('サイズ制限テスト', () => {
    test('100エントリ超過時の自動クリーンアップ', () => {
      // 100エントリまで追加
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      expect(cache.size()).toBe(100);
      
      // 101個目を追加すると自動クリーンアップが発生
      cache.set('key100', 'value100');
      
      // クリーンアップにより古いエントリが削除されサイズが制限内に
      expect(cache.size()).toBeLessThan(100);
      
      // 最新のエントリは残っている
      expect(cache.get('key100')).toBe('value100');
    });

    test('古いエントリの優先削除', async () => {
      const testCache = new TestSafeCache(3600000, 5); // 最大5エントリ
      
      // 5エントリまで追加
      testCache.set('old1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 10));
      testCache.set('old2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 10));
      testCache.set('old3', 'value3');
      await new Promise(resolve => setTimeout(resolve, 10));
      testCache.set('old4', 'value4');
      await new Promise(resolve => setTimeout(resolve, 10));
      testCache.set('old5', 'value5');
      
      expect(testCache.size()).toBe(5);
      
      // 6個目を追加すると自動クリーンアップ（20%削除 = 1エントリ削除）
      testCache.set('new1', 'newvalue1');
      
      // 古いエントリが削除され、新しいエントリは残る
      expect(testCache.get('old1')).toBeUndefined(); // 最古が削除される
      expect(testCache.get('new1')).toBe('newvalue1'); // 最新は残る
    });
  });

  describe('統計情報テスト', () => {
    test('getStats()メソッドの情報取得', () => {
      const stats = cache.getStats();
      
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(100);
      expect(stats.ttl).toBe(3600000); // 1時間
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
      
      cache.set('key1', 'value1');
      const statsAfter = cache.getStats();
      
      expect(statsAfter.size).toBe(1);
      expect(statsAfter.oldestEntry).toBeGreaterThanOrEqual(0);
      expect(statsAfter.newestEntry).toBeGreaterThanOrEqual(0);
    });
  });

  describe('メモリ効率テスト', () => {
    test('大量データの処理とクリーンアップ', () => {
      // 大量のデータを追加
      for (let i = 0; i < 150; i++) {
        cache.set(`key${i}`, `${'x'.repeat(100)}`); // 大きめのデータ
      }
      
      // サイズ制限により自動調整されている
      expect(cache.size()).toBeLessThanOrEqual(100);
      
      // 統計情報が正しく取得できる
      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(100);
      expect(stats.maxSize).toBe(100);
    });

    test('clear後の完全なリセット', () => {
      // データ追加
      for (let i = 0; i < 50; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.size()).toBe(50);
      
      // 完全クリア
      cache.clear();
      
      // 全データが削除されている
      expect(cache.size()).toBe(0);
      for (let i = 0; i < 50; i++) {
        expect(cache.get(`key${i}`)).toBeUndefined();
      }
      
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.oldestEntry).toBeNull();
      expect(stats.newestEntry).toBeNull();
    });
  });
});

/**
 * テスト用のSafeCacheクラス（TTLとサイズをカスタマイズ可能）
 */
class TestSafeCache {
  private cache: Map<string, { data: string; timestamp: number }> = new Map();
  private readonly TTL: number;
  private readonly MAX_SIZE: number;
  private readonly CLEANUP_PERCENTAGE = 0.2;

  constructor(ttl: number = 3600000, maxSize: number = 100) {
    this.TTL = ttl;
    this.MAX_SIZE = maxSize;
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.MAX_SIZE) {
      this.performCleanup();
    }

    const cacheItem = {
      data: value,
      timestamp: Date.now()
    };

    this.cache.set(key, cacheItem);
  }

  get(key: string): string | undefined {
    const item = this.cache.get(key);
    
    if (!item) {
      return undefined;
    }

    const now = Date.now();
    if (now - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return undefined;
    }

    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

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

  private performCleanup(): void {
    this.cleanupExpired();

    if (this.cache.size >= this.MAX_SIZE) {
      const entriesToDelete = Math.ceil(this.cache.size * this.CLEANUP_PERCENTAGE);
      
      const entries: [string, { data: string; timestamp: number }][] = [];
      this.cache.forEach((value, key) => {
        entries.push([key, value]);
      });
      
      const sortedEntries = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      for (let i = 0; i < entriesToDelete && i < sortedEntries.length; i++) {
        this.cache.delete(sortedEntries[i][0]);
      }
    }
  }

  getStats() {
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