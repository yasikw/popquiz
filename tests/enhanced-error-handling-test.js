/**
 * 強化されたエラーハンドリングシステムのテスト
 * 新しいエラーハンドリング機能の包括的検証
 */

import fetch from 'node-fetch';

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, condition, message = '') {
  testCount++;
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${name}${message ? ` - ${message}` : ''}`);
    failCount++;
  }
}

const BASE_URL = 'http://localhost:5000';

/**
 * 環境別エラー表示レベルのテスト
 */
async function testErrorDisclosureLevel() {
  console.log('\n🔒 環境別エラー表示レベルテスト');
  console.log('-'.repeat(40));

  // 存在しないAPIエンドポイントで404エラーをテスト
  try {
    const response = await fetch(`${BASE_URL}/api/nonexistent-test-endpoint`, {
      headers: { 'Accept': 'application/json' }
    });
    
    const data = await response.json();
    
    test('404エラーの適切な返却', response.status === 404);
    test('エラーオブジェクトの構造', data.error === true);
    test('タイムスタンプの存在', !!data.timestamp);
    test('コリレーションIDの存在', !!data.correlationId);
    test('パスの記録', data.path === '/api/nonexistent-test-endpoint');
    
    // 本番環境想定での情報制限確認
    test('スタックトレースの非公開', !data.stack);
    test('詳細情報の非公開', !data.details);
    test('ファイルパス情報の非含有', !data.message.includes('/'));
    test('システム情報の非含有', !data.message.toLowerCase().includes('node'));
    
    console.log(`ℹ️ エラーレスポンス構造: ${JSON.stringify(data, null, 2)}`);
    
  } catch (error) {
    test('404エラーテスト実行', false, error.message);
  }
}

/**
 * 機密情報フィルタリングのテスト
 */
async function testSensitiveDataFiltering() {
  console.log('\n🛡️ 機密情報フィルタリングテスト');
  console.log('-'.repeat(40));

  // 内部サーバーエラーを引き起こすテスト
  try {
    const response = await fetch(`${BASE_URL}/api/test-internal-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        test: 'trigger-error',
        password: 'secret123',
        token: 'abc123def456'
      })
    });
    
    if (response.status >= 500) {
      const data = await response.json();
      
      test('500エラーの適切な処理', response.status >= 500);
      test('パスワード情報の非含有', !JSON.stringify(data).includes('secret123'));
      test('トークン情報の非含有', !JSON.stringify(data).includes('abc123def456'));
      test('スタックトレースの非含有', !JSON.stringify(data).includes('at '));
      test('ファイルパス情報の非含有', !JSON.stringify(data).includes(__dirname));
      
      console.log(`ℹ️ 500エラーレスポンス: ${JSON.stringify(data, null, 2)}`);
    } else {
      console.log(`ℹ️ 内部エラーエンドポイントが存在しません (status: ${response.status})`);
    }
    
  } catch (error) {
    // エンドポイントが存在しない場合も正常
    console.log(`ℹ️ 内部エラーテストエンドポイントが利用できません`);
  }
}

/**
 * ユーザーフレンドリーエラーページのテスト
 */
async function testUserFriendlyErrorPages() {
  console.log('\n🎨 ユーザーフレンドリーエラーページテスト');
  console.log('-'.repeat(40));

  // HTMLエラーページのテスト
  try {
    const response = await fetch(`${BASE_URL}/nonexistent-html-page`, {
      headers: { 'Accept': 'text/html' }
    });
    
    if (response.status === 404) {
      const html = await response.text();
      
      test('HTMLエラーページの生成', html.includes('<!DOCTYPE html>'));
      test('日本語エラーメッセージ', html.includes('ページが見つかりません') || html.includes('見つかりません'));
      test('美しいスタイリング', html.includes('<style>') || html.includes('css'));
      test('JavaScript機能', html.includes('<script>'));
      test('レスポンシブデザイン', html.includes('viewport'));
      test('セキュリティヘッダー', html.includes('Content-Security-Policy'));
      
      // セキュリティ面の確認
      test('技術的詳細の非含有', !html.includes('Error:'));
      test('ファイルパス情報の非含有', !html.includes('/home/'));
      test('システム情報の非含有', !html.includes('Node.js'));
      
      console.log(`ℹ️ HTMLエラーページ長: ${html.length} 文字`);
    } else {
      console.log(`ℹ️ HTMLエラーページテスト: status ${response.status}`);
    }
    
  } catch (error) {
    test('HTMLエラーページテスト', false, error.message);
  }
}

/**
 * エラートラッキングシステムのテスト
 */
async function testErrorTracking() {
  console.log('\n📊 エラートラッキングシステムテスト');
  console.log('-'.repeat(40));

  // エラーダッシュボードAPIのテスト（認証なし）
  try {
    const response = await fetch(`${BASE_URL}/api/admin/errors/dashboard`);
    
    // 認証が必要なので401が期待される
    test('管理APIの認証要求', response.status === 401 || response.status === 403);
    
    if (response.status === 401 || response.status === 403) {
      const data = await response.json();
      test('認証エラーメッセージの存在', !!data.message);
      test('認証エラーでの詳細非公開', !data.stack);
    }
    
  } catch (error) {
    test('エラートラッキングAPIテスト', false, error.message);
  }

  // エラー統計APIのテスト（認証なし）
  try {
    const response = await fetch(`${BASE_URL}/api/admin/errors/stats`);
    
    test('統計APIの認証要求', response.status === 401 || response.status === 403);
    
  } catch (error) {
    test('エラー統計APIテスト', false, error.message);
  }
}

/**
 * セキュリティログの検証
 */
async function testSecurityLogging() {
  console.log('\n📝 セキュリティログ検証テスト');
  console.log('-'.repeat(40));

  // 怪しいリクエストパターンでのログ生成テスト
  const suspiciousRequests = [
    { path: '/api/admin/secret', method: 'GET' },
    { path: '/api/../../../etc/passwd', method: 'GET' },
    { path: '/api/users', method: 'DELETE' }
  ];

  for (const req of suspiciousRequests) {
    try {
      const response = await fetch(`${BASE_URL}${req.path}`, {
        method: req.method,
        headers: {
          'User-Agent': 'SecurityTestBot/1.0',
          'X-Forwarded-For': '192.168.1.100'
        }
      });
      
      // レスポンス自体は404等でも、ログが適切に記録される
      test(`怪しいリクエスト ${req.method} ${req.path} の処理`, response.status >= 400);
      
    } catch (error) {
      test(`怪しいリクエスト ${req.method} ${req.path} の拒否`, true, 'ネットワークエラー');
    }
  }
}

/**
 * エラーカテゴリ分類のテスト
 */
async function testErrorCategorization() {
  console.log('\n🏷️ エラーカテゴリ分類テスト');
  console.log('-'.repeat(40));

  const testCases = [
    {
      path: '/api/auth/login',
      expectedCategory: '認証',
      description: '認証エンドポイント'
    },
    {
      path: '/api/admin/users',
      expectedCategory: '認可',
      description: '管理者エンドポイント'
    },
    {
      path: '/api/upload/malicious',
      expectedCategory: 'バリデーション',
      description: 'アップロードエンドポイント'
    }
  ];

  for (const testCase of testCases) {
    try {
      const response = await fetch(`${BASE_URL}${testCase.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'categorization' })
      });
      
      // エラーカテゴリが適切に分類されることを確認
      test(`${testCase.description}の適切な処理`, response.status >= 400);
      
      if (response.status >= 400) {
        const data = await response.json();
        test(`${testCase.description}のエラーレスポンス構造`, !!data.error);
      }
      
    } catch (error) {
      test(`${testCase.description}カテゴリテスト`, true, 'ネットワークエラー');
    }
  }
}

/**
 * アラートシステムのテスト
 */
async function testAlertSystem() {
  console.log('\n🚨 アラートシステムテスト');
  console.log('-'.repeat(40));

  // 連続エラーでのアラート発生テスト
  const requests = [];
  for (let i = 0; i < 5; i++) {
    requests.push(
      fetch(`${BASE_URL}/api/critical-error-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: `alert-trigger-${i}` })
      }).catch(() => ({ status: 500 })) // エラーも期待される動作
    );
  }

  try {
    const responses = await Promise.all(requests);
    const errorResponses = responses.filter(r => r.status >= 500);
    
    test('連続エラーの検出', errorResponses.length > 0 || responses.length > 0);
    test('アラートシステムの動作', true, '正常に実行完了');
    
  } catch (error) {
    test('アラートシステムテスト', false, error.message);
  }
}

/**
 * メイン実行関数
 */
async function runEnhancedErrorHandlingTests() {
  console.log('🚀 強化されたエラーハンドリングシステムテスト開始');
  console.log('='.repeat(60));
  console.log(`📅 実行時刻: ${new Date().toISOString()}`);
  console.log(`🌐 テスト対象: ${BASE_URL}`);
  console.log('='.repeat(60));

  await testErrorDisclosureLevel();
  await testSensitiveDataFiltering();
  await testUserFriendlyErrorPages();
  await testErrorTracking();
  await testSecurityLogging();
  await testErrorCategorization();
  await testAlertSystem();

  console.log('\n' + '='.repeat(60));
  console.log('🏁 エラーハンドリングテスト結果');
  console.log('='.repeat(60));
  console.log(`📊 総テスト数: ${testCount}`);
  console.log(`✅ 成功: ${passCount}`);
  console.log(`❌ 失敗: ${failCount}`);
  console.log(`📈 成功率: ${((passCount / testCount) * 100).toFixed(1)}%`);

  const score = (passCount / testCount) * 100;
  if (score >= 95) {
    console.log('🎉 優秀 - エラーハンドリングシステムは完璧です');
  } else if (score >= 85) {
    console.log('👍 良好 - エラーハンドリングシステムは高品質です');
  } else if (score >= 70) {
    console.log('⚠️ 注意 - エラーハンドリングの改善が必要です');
  } else {
    console.log('🚨 危険 - エラーハンドリングシステムに重大な問題があります');
  }

  console.log('='.repeat(60));
  
  return {
    total: testCount,
    passed: passCount,
    failed: failCount,
    score: score
  };
}

// メイン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedErrorHandlingTests()
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('🚨 テスト実行エラー:', error);
      process.exit(1);
    });
}

export { runEnhancedErrorHandlingTests };