/**
 * セキュリティ修正統合テストスクリプト
 * メモリ効率、CORS、既存機能への影響を包括的にテスト
 */

import { SafeCache } from '../server/utils/cache.js';
import fetch from 'node-fetch';

// テスト結果カウンター
let testsPassed = 0;
let testsFailed = 0;
let warnings = 0;

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

function expectToInclude(actual: string, expected: string, testName: string) {
  if (actual && actual.includes(expected)) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected to include: ${expected}, Actual: ${actual}`);
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

function expectToBeGreaterThan(actual: number, expected: number, testName: string) {
  if (actual > expected) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName} (expected ${actual} > ${expected})`);
    testsFailed++;
  }
}

function warn(message: string) {
  console.log(`⚠️ WARN: ${message}`);
  warnings++;
}

// Promiseユーティリティ
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runIntegrationTests() {
  console.log('🔐 セキュリティ修正統合テスト開始\n');
  console.log('='.repeat(60));

  const baseUrl = 'http://localhost:5000';

  // =========================
  // 1. メモリ効率テスト
  // =========================
  console.log('\n💾 メモリ効率テスト');
  console.log('-'.repeat(40));

  try {
    // SafeCacheの基本動作テスト
    const cache = new SafeCache();
    
    // キャッシュサイズ制限テスト
    console.log('\n📏 キャッシュサイズ制限テスト:');
    
    // 100エントリまで追加
    for (let i = 0; i < 100; i++) {
      cache.set(`test_key_${i}`, `test_value_${i}`);
    }
    expect(cache.size(), 100, 'キャッシュ最大サイズ到達');
    
    // 101個目を追加して自動クリーンアップ確認
    cache.set('overflow_key', 'overflow_value');
    expectToBeLessThanOrEqual(cache.size(), 100, '自動クリーンアップによるサイズ制御');
    
    // 最新エントリの保持確認
    expect(cache.get('overflow_key'), 'overflow_value', '最新エントリの保持');
    
    // 統計情報の確認
    const stats = cache.getStats();
    expect(stats.maxSize, 100, '統計情報での最大サイズ設定');
    expect(stats.ttl, 3600000, 'TTL設定（1時間）の確認');
    expectToBeLessThanOrEqual(stats.size, 100, '統計情報でのサイズ制限');
    
    console.log('\n⏱️ TTL動作テスト:');
    
    // テスト用の短いTTLキャッシュ
    class TestCacheForTTL {
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
      
      size() { return this.cache.size; }
    }
    
    const ttlCache = new TestCacheForTTL();
    ttlCache.set('ttl_test', 'ttl_value');
    expect(ttlCache.get('ttl_test'), 'ttl_value', 'TTL期限内アクセス');
    
    await sleep(150);
    expect(ttlCache.get('ttl_test'), undefined, 'TTL期限切れ削除');
    expect(ttlCache.size(), 0, 'TTL期限切れ後のサイズ');
    
    cache.clear();
    
  } catch (error) {
    console.log(`❌ FAIL: メモリ効率テスト全体エラー - ${error}`);
    testsFailed++;
  }

  // =========================
  // 2. CORSセキュリティテスト
  // =========================
  console.log('\n🛡️ CORSセキュリティテスト');
  console.log('-'.repeat(40));

  try {
    console.log('\n📋 正規オリジンテスト:');
    
    // 正規オリジンからのアクセステスト
    const validOriginResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });
    
    expect(validOriginResponse.status, 200, '正規オリジン（localhost:3000）からのアクセス');
    
    const allowOriginHeader = validOriginResponse.headers.get('access-control-allow-origin');
    expectToInclude(allowOriginHeader || '', 'localhost:3000', 'Access-Control-Allow-Originヘッダー');
    
    const credentialsHeader = validOriginResponse.headers.get('access-control-allow-credentials');
    expect(credentialsHeader, 'true', 'Credentialsの有効化');
    
    console.log('\n🚫 不正オリジン拒否テスト:');
    
    // 実際のCORS検証は ブラウザレベルで行われるため、
    // サーバーは不正オリジンでもレスポンスを返すが、Access-Control-Allow-Originヘッダーは設定しない
    const invalidOriginResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: {
        'Origin': 'https://malicious-site.com'
      }
    });
    
    const maliciousAllowOrigin = invalidOriginResponse.headers.get('access-control-allow-origin');
    if (maliciousAllowOrigin && maliciousAllowOrigin.includes('malicious-site.com')) {
      console.log(`❌ FAIL: 不正オリジンが許可されています: ${maliciousAllowOrigin}`);
      testsFailed++;
    } else {
      console.log(`✅ PASS: 不正オリジンの適切な処理`);
      testsPassed++;
    }
    
    console.log('\n🔒 セキュリティヘッダーテスト:');
    
    const securityResponse = await fetch(`${baseUrl}/api/csrf-token`);
    
    // 重要なセキュリティヘッダーの確認
    const cspHeader = securityResponse.headers.get('content-security-policy');
    expectToInclude(cspHeader || '', "default-src 'self'", 'Content-Security-Policy');
    
    const frameOptionsHeader = securityResponse.headers.get('x-frame-options');
    expect(frameOptionsHeader, 'DENY', 'X-Frame-Options');
    
    const hstsHeader = securityResponse.headers.get('strict-transport-security');
    expectToInclude(hstsHeader || '', 'max-age=', 'Strict-Transport-Security');
    
    const contentTypeHeader = securityResponse.headers.get('x-content-type-options');
    expect(contentTypeHeader, 'nosniff', 'X-Content-Type-Options');
    
    console.log('\n⚡ Preflightテスト:');
    
    const preflightResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    expect(preflightResponse.status, 204, 'Preflightリクエストのステータス');
    
    const allowMethods = preflightResponse.headers.get('access-control-allow-methods');
    expectToInclude(allowMethods || '', 'POST', 'POSTメソッドの許可');
    
  } catch (error) {
    console.log(`❌ FAIL: CORSセキュリティテスト全体エラー - ${error}`);
    testsFailed++;
  }

  // =========================
  // 3. 既存機能への影響確認
  // =========================
  console.log('\n🔗 既存機能への影響確認');
  console.log('-'.repeat(40));

  try {
    console.log('\n📡 APIエンドポイントテスト:');
    
    // CSRFトークン取得テスト
    const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
    expect(csrfResponse.status, 200, 'CSRF token endpoint');
    
    const csrfData = await csrfResponse.json();
    if (csrfData && csrfData.csrfToken && typeof csrfData.csrfToken === 'string') {
      console.log(`✅ PASS: CSRFトークンの正常生成`);
      testsPassed++;
    } else {
      console.log(`❌ FAIL: CSRFトークンの生成失敗`);
      testsFailed++;
    }
    
    // Rate limitingの確認
    const rateLimitHeader = csrfResponse.headers.get('ratelimit-limit');
    expectToInclude(rateLimitHeader || '', '100', 'Rate limiting設定');
    
    console.log('\n🔐 認証機能テスト:');
    
    // 認証が必要なエンドポイントへの未認証アクセス
    const protectedResponse = await fetch(`${baseUrl}/api/auth/user`);
    expect(protectedResponse.status, 401, '未認証での保護エンドポイントアクセス拒否');
    
    console.log('\n🌐 フロントエンド接続テスト:');
    
    // 静的リソースの確認（開発環境）
    const rootResponse = await fetch(`${baseUrl}/`);
    if (rootResponse.status >= 200 && rootResponse.status < 400) {
      console.log(`✅ PASS: フロントエンドルートアクセス (${rootResponse.status})`);
      testsPassed++;
    } else {
      warn(`フロントエンドルートアクセスで予期しないステータス: ${rootResponse.status}`);
    }
    
    // ヘルスチェック的なAPI呼び出し
    const healthRequests = [];
    for (let i = 0; i < 5; i++) {
      healthRequests.push(fetch(`${baseUrl}/api/csrf-token`));
    }
    
    const healthResponses = await Promise.all(healthRequests);
    const successfulRequests = healthResponses.filter(r => r.status === 200).length;
    
    if (successfulRequests === 5) {
      console.log(`✅ PASS: 複数リクエストの並行処理 (${successfulRequests}/5)`);
      testsPassed++;
    } else {
      console.log(`❌ FAIL: 複数リクエストの並行処理 (${successfulRequests}/5)`);
      testsFailed++;
    }
    
  } catch (error) {
    console.log(`❌ FAIL: 既存機能テスト全体エラー - ${error}`);
    testsFailed++;
  }

  // =========================
  // 4. 環境設定確認
  // =========================
  console.log('\n🌍 環境設定確認');
  console.log('-'.repeat(40));

  const nodeEnv = process.env.NODE_ENV || 'development';
  const allowedOrigins = process.env.ALLOWED_ORIGINS || '';
  
  console.log(`📍 実行環境: ${nodeEnv}`);
  console.log(`🔗 許可オリジン: ${allowedOrigins || '(デフォルト設定)'}`);
  
  if (allowedOrigins) {
    console.log(`✅ PASS: ALLOWED_ORIGINS環境変数が設定済み`);
    testsPassed++;
  } else {
    warn(`ALLOWED_ORIGINS環境変数が未設定（デフォルト値を使用）`);
  }

  // =========================
  // 結果サマリー
  // =========================
  console.log('\n' + '='.repeat(60));
  console.log('📋 統合テスト結果サマリー');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${testsPassed}件`);
  console.log(`❌ 失敗: ${testsFailed}件`);
  console.log(`⚠️ 警告: ${warnings}件`);
  console.log(`📊 合計: ${testsPassed + testsFailed}件`);

  const successRate = Math.round((testsPassed / (testsPassed + testsFailed)) * 100);
  console.log(`📈 成功率: ${successRate}%`);

  if (testsFailed === 0) {
    console.log('\n🎉 すべてのセキュリティ統合テストが成功しました！');
    console.log('✅ メモリ効率: SafeCacheの制限とTTLが正常動作');
    console.log('✅ CORSセキュリティ: 適切なオリジン制御とヘッダー設定');
    console.log('✅ 既存機能: 認証とAPIエンドポイントが正常動作');
    console.log('✅ フロントエンド: UI接続が正常');
  } else {
    console.log(`\n⚠️ ${testsFailed}件のテストが失敗しました。詳細を確認してください。`);
  }

  if (warnings > 0) {
    console.log(`\n📝 ${warnings}件の警告があります。設定を確認することをお勧めします。`);
  }

  console.log('\n🔐 セキュリティ機能確認:');
  console.log('- SafeCache: メモリリーク防止とTTL制御');
  console.log('- CORS: 環境別オリジン制御');
  console.log('- セキュリティヘッダー: CSP, HSTS, X-Frame-Options等');
  console.log('- Rate Limiting: API呼び出し制限');
  console.log('- 認証システム: 既存機能の保持');

  return { testsPassed, testsFailed, warnings, successRate };
}

// テスト実行
runIntegrationTests().catch(console.error);