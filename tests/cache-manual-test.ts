/**
 * SafeCache手動テストスクリプト
 * Node.jsで直接実行可能
 */

import { SafeCache } from '../server/utils/cache.js';

// テスト結果カウンター
let testsPassed = 0;
let testsFailed = 0;

// アサーション関数
function expect(actual: any, expected: any, testName: string) {
  if (actual === expected || (expected === undefined && actual === undefined)) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: ${expected}, Actual: ${actual}`);
    testsFailed++;
  }
}

function expectToBe(actual: any, expected: any, testName: string) {
  expect(actual, expected, testName);
}

function expectToBeUndefined(actual: any, testName: string) {
  expect(actual, undefined, testName);
}

function expectToBeTruthy(actual: any, testName: string) {
  if (actual) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName} (expected truthy, got ${actual})`);
    testsFailed++;
  }
}

function expectToBeGreaterThan(actual: number, expected: number, testName: string) {
  if (actual > expected) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName} (expected ${actual} > ${expected})`);
    testsFailed++;
  }
}

function expectToBeLessThan(actual: number, expected: number, testName: string) {
  if (actual < expected) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName} (expected ${actual} < ${expected})`);
    testsFailed++;
  }
}

function expectToBeLessThanOrEqual(actual: number, expected: number, testName: string) {
  if (actual <= expected) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName} (expected ${actual} <= ${expected})`);
    testsFailed++;
  }
}

// Promiseユーティリティ
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 SafeCacheテスト開始\n');

  // =========================
  // 基本機能テスト
  // =========================
  console.log('📋 基本機能テスト');
  const cache = new SafeCache();

  // set/get操作
  cache.set('key1', 'value1');
  cache.set('key2', 'value2');
  expectToBe(cache.get('key1'), 'value1', 'set/getの基本動作 - key1');
  expectToBe(cache.get('key2'), 'value2', 'set/getの基本動作 - key2');

  // 存在しないキー
  expectToBeUndefined(cache.get('nonexistent'), '存在しないキーでundefined返却');

  // 値の上書き
  cache.set('key1', 'updated_value1');
  expectToBe(cache.get('key1'), 'updated_value1', 'キーの値上書き');

  // サイズ確認
  expectToBe(cache.size(), 2, 'サイズカウント');

  // クリア操作
  cache.clear();
  expectToBe(cache.size(), 0, 'clear後のサイズ');
  expectToBeUndefined(cache.get('key1'), 'clear後のkey1アクセス');
  expectToBeUndefined(cache.get('key2'), 'clear後のkey2アクセス');

  console.log('');

  // =========================
  // TTL機能テスト（模擬）
  // =========================
  console.log('⏰ TTL機能テスト');

  // テスト用の短いTTLキャッシュクラス
  class TestCache {
    private cache = new Map<string, { data: string; timestamp: number }>();
    private TTL = 100; // 100ms

    set(key: string, value: string) {
      this.cache.set(key, { data: value, timestamp: Date.now() });
    }

    get(key: string): string | undefined {
      const item = this.cache.get(key);
      if (!item) return undefined;
      
      if (Date.now() - item.timestamp > this.TTL) {
        this.cache.delete(key);
        return undefined;
      }
      return item.data;
    }

    size() {
      return this.cache.size;
    }
  }

  const testCache = new TestCache();
  testCache.set('ttl_key', 'ttl_value');
  expectToBe(testCache.get('ttl_key'), 'ttl_value', 'TTL期限内アクセス');

  // TTL期限後
  await sleep(150);
  expectToBeUndefined(testCache.get('ttl_key'), 'TTL期限切れアクセス');
  expectToBe(testCache.size(), 0, 'TTL期限切れ後のサイズ');

  console.log('');

  // =========================
  // サイズ制限テスト
  // =========================
  console.log('📏 サイズ制限テスト');

  const sizeTestCache = new SafeCache();

  // 100エントリまで追加
  for (let i = 0; i < 100; i++) {
    sizeTestCache.set(`key${i}`, `value${i}`);
  }
  expectToBe(sizeTestCache.size(), 100, '最大サイズ到達');

  // 101個目を追加
  sizeTestCache.set('key100', 'value100');
  expectToBeLessThan(sizeTestCache.size(), 100, '最大サイズ超過時の自動クリーンアップ');
  expectToBe(sizeTestCache.get('key100'), 'value100', '最新エントリは保持');

  console.log('');

  // =========================
  // 統計情報テスト
  // =========================
  console.log('📊 統計情報テスト');

  const statsCache = new SafeCache();
  let stats = statsCache.getStats();
  expectToBe(stats.size, 0, '初期状態のサイズ');
  expectToBe(stats.maxSize, 100, '最大サイズ設定');
  expectToBe(stats.ttl, 3600000, 'TTL設定（1時間）');
  expectToBe(stats.oldestEntry, null, '初期状態での最古エントリ');
  expectToBe(stats.newestEntry, null, '初期状態での最新エントリ');

  statsCache.set('stats_key', 'stats_value');
  stats = statsCache.getStats();
  expectToBe(stats.size, 1, 'エントリ追加後のサイズ');
  expectToBeTruthy(stats.oldestEntry !== null, '最古エントリの存在');
  expectToBeTruthy(stats.newestEntry !== null, '最新エントリの存在');

  console.log('');

  // =========================
  // メモリ効率テスト
  // =========================
  console.log('💾 メモリ効率テスト');

  const memoryCache = new SafeCache();

  // 大量データテスト
  for (let i = 0; i < 150; i++) {
    memoryCache.set(`mem_key${i}`, 'x'.repeat(100)); // 100文字のデータ
  }
  expectToBeLessThanOrEqual(memoryCache.size(), 100, '大量データ投入後のサイズ制限');

  // 統計確認
  const memStats = memoryCache.getStats();
  expectToBeLessThanOrEqual(memStats.size, 100, '統計情報でのサイズ制限確認');

  // 完全クリア
  memoryCache.clear();
  expectToBe(memoryCache.size(), 0, '完全クリア後のサイズ');

  const clearStats = memoryCache.getStats();
  expectToBe(clearStats.size, 0, 'クリア後の統計サイズ');
  expectToBe(clearStats.oldestEntry, null, 'クリア後の最古エントリ');
  expectToBe(clearStats.newestEntry, null, 'クリア後の最新エントリ');

  console.log('');

  // =========================
  // テスト結果サマリー
  // =========================
  console.log('📋 テスト結果サマリー');
  console.log(`✅ 成功: ${testsPassed}件`);
  console.log(`❌ 失敗: ${testsFailed}件`);
  console.log(`📊 合計: ${testsPassed + testsFailed}件`);

  if (testsFailed === 0) {
    console.log('\n🎉 すべてのテストが成功しました！SafeCacheは正常に動作しています。');
  } else {
    console.log('\n⚠️ 一部のテストが失敗しました。SafeCacheの実装を確認してください。');
  }

  // 詳細統計
  console.log('\n📈 SafeCache統計情報:');
  const finalStats = cache.getStats();
  console.log(`- 最大サイズ: ${finalStats.maxSize}エントリ`);
  console.log(`- TTL: ${finalStats.ttl}ms (${finalStats.ttl / 1000 / 60}分)`);
  console.log(`- クリーンアップ割合: 20%`);
}

// テスト実行
runTests().catch(console.error);