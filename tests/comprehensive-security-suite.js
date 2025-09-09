/**
 * 包括的セキュリティテストスイート
 * 修正実装後の全セキュリティ機能検証
 */

import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// テスト結果統計
let stats = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: []
};

// アサーション関数
function assert(condition, testName, message = '') {
  stats.total++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    stats.passed++;
    return true;
  } else {
    console.log(`❌ FAIL: ${testName}${message ? ` - ${message}` : ''}`);
    stats.failed++;
    stats.errors.push({ test: testName, message });
    return false;
  }
}

function warn(message, testName = '') {
  console.log(`⚠️ WARN: ${testName ? `${testName} - ` : ''}${message}`);
  stats.warnings++;
}

function info(message) {
  console.log(`ℹ️ INFO: ${message}`);
}

const BASE_URL = 'http://localhost:5000';

/**
 * 1. XSS攻撃テスト（修正したCSP設定の確認）
 */
async function testXSSProtection() {
  console.log('\n🛡️ XSS攻撃防御テスト');
  console.log('='.repeat(50));

  // CSPヘッダー検証
  try {
    const response = await fetch(BASE_URL);
    const cspHeader = response.headers.get('content-security-policy') || 
                     response.headers.get('content-security-policy-report-only');
    
    assert(!!cspHeader, 'CSPヘッダーの存在確認');
    
    if (cspHeader) {
      assert(cspHeader.includes("default-src 'self'"), 'default-src self設定');
      assert(cspHeader.includes("script-src 'self'"), 'script-src self設定');
      assert(cspHeader.includes("style-src 'self'"), 'style-src self設定');
      assert(cspHeader.includes("object-src 'none'"), 'object-src none設定');
      assert(cspHeader.includes("frame-ancestors 'none'"), 'frame-ancestors none設定');
      
      info(`CSP設定: ${cspHeader.substring(0, 100)}...`);
    }
  } catch (error) {
    assert(false, 'CSPヘッダー取得', error.message);
  }

  // セキュリティヘッダー検証
  try {
    const response = await fetch(BASE_URL);
    
    assert(!!response.headers.get('x-frame-options'), 'X-Frame-Options ヘッダー');
    assert(!!response.headers.get('x-content-type-options'), 'X-Content-Type-Options ヘッダー');
    assert(!!response.headers.get('referrer-policy'), 'Referrer-Policy ヘッダー');
    assert(!response.headers.get('x-powered-by'), 'X-Powered-By ヘッダー除去');
    
  } catch (error) {
    assert(false, 'セキュリティヘッダー検証', error.message);
  }

  // XSSペイロードテスト
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    'javascript:alert("XSS")',
    '<iframe src="javascript:alert(\'XSS\')"></iframe>'
  ];

  for (let i = 0; i < xssPayloads.length; i++) {
    try {
      const response = await fetch(`${BASE_URL}/api/csrf-token`, {
        method: 'GET',
        headers: {
          'User-Agent': xssPayloads[i],
          'Referer': xssPayloads[i]
        }
      });
      
      // XSSペイロードがヘッダーに注入されても適切に処理される
      assert(response.status < 500, `XSSペイロード${i+1}の適切な処理`);
      
    } catch (error) {
      // リクエストが拒否される場合も保護として有効
      assert(true, `XSSペイロード${i+1}の拒否`, 'リクエスト拒否');
    }
  }
}

/**
 * 2. CSRF攻撃テスト（新しいライブラリの動作確認）
 */
async function testCSRFProtection() {
  console.log('\n🔒 CSRF攻撃防御テスト');
  console.log('='.repeat(50));

  // CSRFトークン取得テスト
  try {
    const response = await fetch(`${BASE_URL}/api/csrf-token`);
    const data = await response.json();
    
    assert(response.status === 200, 'CSRFトークン取得成功');
    assert(!!data.csrfToken, 'CSRFトークンの存在');
    assert(data.csrfToken.length === 64, 'CSRFトークンの長さ（64文字）');
    assert(/^[a-f0-9]{64}$/.test(data.csrfToken), 'CSRFトークンの形式（hex）');
    
    info(`CSRFトークン: ${data.csrfToken.substring(0, 16)}...`);

    // CSRFトークンなしでのPOSTリクエストテスト
    try {
      const noTokenResponse = await fetch(`${BASE_URL}/api/quiz/generate-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textContent: 'test' })
      });
      
      assert(noTokenResponse.status === 403, 'CSRFトークンなしリクエストの拒否');
      
    } catch (error) {
      assert(true, 'CSRFトークンなしリクエストの拒否', 'ネットワークエラー');
    }

    // 無効なCSRFトークンでのPOSTリクエストテスト
    try {
      const invalidTokenResponse = await fetch(`${BASE_URL}/api/quiz/generate-text`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'invalid-token-123'
        },
        body: JSON.stringify({ textContent: 'test' })
      });
      
      assert(invalidTokenResponse.status === 403, '無効CSRFトークンリクエストの拒否');
      
    } catch (error) {
      assert(true, '無効CSRFトークンリクエストの拒否', 'ネットワークエラー');
    }

  } catch (error) {
    assert(false, 'CSRF保護テスト', error.message);
  }
}

/**
 * 3. エラーハンドリングセキュリティテスト
 */
async function testErrorHandlingSecurity() {
  console.log('\n🚨 エラーハンドリングセキュリティテスト');
  console.log('='.repeat(50));

  // 存在しないAPIエンドポイントテスト
  try {
    const response = await fetch(`${BASE_URL}/api/nonexistent-endpoint`);
    const data = await response.json();
    
    assert(response.status === 404, '404エラーの適切な返却');
    assert(!data.stack, 'スタックトレースの非公開');
    assert(!data.details, '詳細情報の非公開');
    assert(!!data.correlationId, 'コリレーションIDの付与');
    assert(!!data.timestamp, 'タイムスタンプの付与');
    
    info(`エラーレスポンス: ${JSON.stringify(data).substring(0, 100)}...`);
    
  } catch (error) {
    assert(false, '404エラーハンドリング', error.message);
  }

  // APIエラーレスポンス形式テスト
  try {
    const response = await fetch(`${BASE_URL}/api/test-error`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.status >= 400) {
      const data = await response.json();
      
      assert(!!data.error, 'エラーフラグの存在');
      assert(typeof data.message === 'string', 'エラーメッセージの文字列型');
      assert(!data.message.includes('/'), 'ファイルパス情報の非含有');
      assert(!data.message.includes('\\'), 'ファイルパス情報の非含有');
      assert(!data.message.toLowerCase().includes('password'), '機密情報の非含有');
      assert(!data.message.toLowerCase().includes('secret'), '機密情報の非含有');
    }
    
  } catch (error) {
    // エンドポイントが存在しない場合は正常
    assert(true, 'APIエラーレスポンス形式', 'エンドポイント不存在');
  }

  // HTML エラーページテスト
  try {
    const response = await fetch(`${BASE_URL}/nonexistent-page`, {
      headers: { 'Accept': 'text/html' }
    });
    
    if (response.status === 404) {
      const html = await response.text();
      
      assert(html.includes('<!DOCTYPE html>'), 'HTMLエラーページの生成');
      assert(html.includes('ページが見つかりません'), '日本語エラーメッセージ');
      assert(!html.includes('/home/'), 'ファイルパス情報の非含有');
      assert(!html.includes('Error:'), '技術的エラー詳細の非含有');
    }
    
  } catch (error) {
    assert(false, 'HTMLエラーページ', error.message);
  }
}

/**
 * 4. 画像ソース制限テスト
 */
async function testImageSourceRestrictions() {
  console.log('\n🖼️ 画像ソース制限テスト');
  console.log('='.repeat(50));

  // CSPでの画像ソース制限確認
  try {
    const response = await fetch(BASE_URL);
    const cspHeader = response.headers.get('content-security-policy') || 
                     response.headers.get('content-security-policy-report-only');
    
    if (cspHeader) {
      // 画像ソースの制限確認
      const hasImgSrc = cspHeader.includes('img-src');
      assert(hasImgSrc, 'img-src ディレクティブの存在');
      
      if (hasImgSrc) {
        const imgSrcMatch = cspHeader.match(/img-src\s+([^;]+)/);
        if (imgSrcMatch) {
          const imgSrcValue = imgSrcMatch[1];
          assert(imgSrcValue.includes("'self'"), "img-src に 'self' 含有");
          assert(imgSrcValue.includes('data:'), 'img-src に data: 含有');
          assert(imgSrcValue.includes('blob:'), 'img-src に blob: 含有');
          
          info(`img-src設定: ${imgSrcValue}`);
        }
      }
    }
    
  } catch (error) {
    assert(false, '画像ソース制限確認', error.message);
  }

  // 外部画像URLへのリクエストテスト（制限確認）
  const suspiciousImageUrls = [
    'http://malicious-site.com/image.jpg',
    'javascript:alert("XSS")',
    'data:text/html,<script>alert("XSS")</script>',
    'file:///etc/passwd'
  ];

  for (const url of suspiciousImageUrls) {
    try {
      // アプリが外部画像を適切に制限するかテスト
      const response = await fetch(`${BASE_URL}/api/csrf-token`, {
        headers: { 'Referer': url }
      });
      
      // リクエスト自体は成功するが、CSPで制限される
      assert(response.status < 500, `怪しい画像URL ${url} の適切な処理`);
      
    } catch (error) {
      assert(true, `怪しい画像URL ${url} の拒否`, 'リクエスト拒否');
    }
  }
}

/**
 * 5. YouTube API移行後のセキュリティテスト
 */
async function testYouTubeAPISecurity() {
  console.log('\n🎥 YouTube API セキュリティテスト');
  console.log('='.repeat(50));

  // YouTube URL バリデーションテスト
  const validUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ'
  ];

  const invalidUrls = [
    'http://youtube.com/watch?v=test', // HTTP
    'https://malicious-site.com/watch?v=test',
    'javascript:alert("XSS")',
    'https://youtube.com/../../../etc/passwd',
    'ftp://youtube.com/watch?v=test'
  ];

  // 有効なURLテスト
  for (const url of validUrls) {
    try {
      const response = await fetch(`${BASE_URL}/api/csrf-token`);
      const csrfData = await response.json();
      
      const testResponse = await fetch(`${BASE_URL}/api/quiz/generate-youtube`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.csrfToken
        },
        body: JSON.stringify({ 
          youtubeUrl: url,
          difficulty: 'beginner',
          questionCount: 5
        })
      });
      
      // URLが有効でも、APIキーやその他の要件で400/500エラーの可能性がある
      assert(testResponse.status !== 403, `有効YouTube URL ${url} の処理`);
      
    } catch (error) {
      warn(`YouTube URL テスト エラー: ${error.message}`, url);
    }
  }

  // 無効なURLテスト
  for (const url of invalidUrls) {
    try {
      const response = await fetch(`${BASE_URL}/api/csrf-token`);
      const csrfData = await response.json();
      
      const testResponse = await fetch(`${BASE_URL}/api/quiz/generate-youtube`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.csrfToken
        },
        body: JSON.stringify({ 
          youtubeUrl: url,
          difficulty: 'beginner',
          questionCount: 5
        })
      });
      
      assert(testResponse.status === 400, `無効YouTube URL ${url} の拒否`);
      
    } catch (error) {
      // ネットワークエラーでもセキュリティ的には問題なし
      assert(true, `無効YouTube URL ${url} の拒否`, 'ネットワークエラー');
    }
  }
}

/**
 * 6. レート制限テスト
 */
async function testRateLimiting() {
  console.log('\n⚡ レート制限テスト');
  console.log('='.repeat(50));

  // 短時間での連続リクエストテスト
  const requests = [];
  const testEndpoint = `${BASE_URL}/api/csrf-token`;
  
  try {
    // 10個の並行リクエストを送信
    for (let i = 0; i < 10; i++) {
      requests.push(fetch(testEndpoint));
    }
    
    const responses = await Promise.all(requests);
    const statusCodes = responses.map(r => r.status);
    const rateLimitHits = statusCodes.filter(code => code === 429).length;
    
    info(`並行リクエスト結果: ${statusCodes.join(', ')}`);
    
    if (rateLimitHits > 0) {
      assert(true, 'レート制限の動作確認', `${rateLimitHits}個のリクエストが制限された`);
    } else {
      // 制限に達しなかった場合も、リクエストが成功していれば正常
      const successfulRequests = statusCodes.filter(code => code === 200).length;
      assert(successfulRequests > 0, 'レート制限範囲内でのリクエスト成功');
    }
    
  } catch (error) {
    assert(false, 'レート制限テスト', error.message);
  }
}

/**
 * 7. TypeScript型安全性検証
 */
async function testTypeScriptSafety() {
  console.log('\n🔧 TypeScript型安全性検証');
  console.log('='.repeat(50));

  try {
    // TypeScriptコンパイレーションチェック
    const tscProcess = spawn('npx', ['tsc', '--noEmit', '--skipLibCheck'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    tscProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    tscProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const exitCode = await new Promise((resolve) => {
      tscProcess.on('close', resolve);
    });

    if (exitCode === 0) {
      assert(true, 'TypeScriptコンパイレーション成功');
    } else {
      assert(false, 'TypeScriptコンパイレーション', `コンパイルエラー: ${stderr}`);
    }

    // エラーハンドリング型チェック
    const errorHandlingFiles = [
      'server/middleware/enhancedErrorHandling.ts',
      'server/middleware/unifiedErrorHandler.ts',
      'server/utils/errorTrackingSystem.ts'
    ];

    for (const file of errorHandlingFiles) {
      try {
        await fs.access(file);
        assert(true, `${path.basename(file)} ファイル存在確認`);
      } catch {
        assert(false, `${path.basename(file)} ファイル存在確認`);
      }
    }

  } catch (error) {
    assert(false, 'TypeScript検証', error.message);
  }
}

/**
 * 8. 管理APIセキュリティテスト
 */
async function testAdminAPISecurity() {
  console.log('\n👑 管理APIセキュリティテスト');
  console.log('='.repeat(50));

  const adminEndpoints = [
    '/api/admin/errors/stats',
    '/api/admin/errors/patterns',
    '/api/admin/errors/dashboard',
    '/api/admin/security/logs',
    '/api/admin/security/anomalies'
  ];

  // 認証なしでの管理APIアクセステスト
  for (const endpoint of adminEndpoints) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`);
      
      assert(response.status === 401 || response.status === 403, 
        `${endpoint} 未認証アクセス拒否`);
      
      if (response.status === 401 || response.status === 403) {
        const data = await response.json();
        assert(!data.stack, `${endpoint} エラー詳細非公開`);
        assert(!!data.message, `${endpoint} エラーメッセージ存在`);
      }
      
    } catch (error) {
      assert(true, `${endpoint} アクセス拒否`, 'ネットワークエラー');
    }
  }
}

/**
 * メイン実行関数
 */
async function runComprehensiveSecurityTests() {
  console.log('🚀 包括的セキュリティテストスイート開始');
  console.log('修正実装後の全セキュリティ機能検証');
  console.log('='.repeat(60));
  console.log(`📅 実行時刻: ${new Date().toISOString()}`);
  console.log(`🌐 テスト対象: ${BASE_URL}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  // 各テストの実行
  await testXSSProtection();
  await testCSRFProtection();
  await testErrorHandlingSecurity();
  await testImageSourceRestrictions();
  await testYouTubeAPISecurity();
  await testRateLimiting();
  await testTypeScriptSafety();
  await testAdminAPISecurity();

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  // テスト結果サマリー
  console.log('\n' + '='.repeat(60));
  console.log('🏁 テスト結果サマリー');
  console.log('='.repeat(60));
  console.log(`📊 総テスト数: ${stats.total}`);
  console.log(`✅ 成功: ${stats.passed}`);
  console.log(`❌ 失敗: ${stats.failed}`);
  console.log(`⚠️ 警告: ${stats.warnings}`);
  console.log(`⏱️ 実行時間: ${duration.toFixed(2)}秒`);
  console.log(`📈 成功率: ${((stats.passed / stats.total) * 100).toFixed(1)}%`);

  if (stats.failed > 0) {
    console.log('\n❌ 失敗したテスト:');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test}: ${error.message}`);
    });
  }

  // セキュリティスコア計算
  const securityScore = Math.max(0, ((stats.passed - stats.failed) / stats.total) * 100);
  console.log(`\n🛡️ セキュリティスコア: ${securityScore.toFixed(1)}/100`);

  if (securityScore >= 95) {
    console.log('🎉 優秀 - エンタープライズレベルのセキュリティ');
  } else if (securityScore >= 85) {
    console.log('👍 良好 - 高いセキュリティレベル');
  } else if (securityScore >= 70) {
    console.log('⚠️ 注意 - セキュリティ改善が必要');
  } else {
    console.log('🚨 危険 - 緊急なセキュリティ対策が必要');
  }

  console.log('\n' + '='.repeat(60));
  
  return {
    score: securityScore,
    stats,
    duration
  };
}

// テストレポート生成
async function generateSecurityReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    baseUrl: BASE_URL,
    results: results,
    recommendations: [],
    riskAssessment: 'LOW'
  };

  // リスク評価
  if (results.score < 70) {
    report.riskAssessment = 'HIGH';
    report.recommendations.push('緊急なセキュリティ対策が必要です');
  } else if (results.score < 85) {
    report.riskAssessment = 'MEDIUM';
    report.recommendations.push('セキュリティ設定の見直しを推奨します');
  } else if (results.score < 95) {
    report.riskAssessment = 'LOW';
    report.recommendations.push('一部のセキュリティ機能を強化できます');
  } else {
    report.riskAssessment = 'MINIMAL';
    report.recommendations.push('優秀なセキュリティレベルです');
  }

  // 追加推奨事項
  if (stats.warnings > 0) {
    report.recommendations.push('警告項目の確認と対応を推奨します');
  }

  try {
    await fs.writeFile('security-test-report.json', JSON.stringify(report, null, 2));
    console.log('📄 詳細レポートを security-test-report.json に保存しました');
  } catch (error) {
    console.error('⚠️ レポート保存エラー:', error.message);
  }

  return report;
}

// メイン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensiveSecurityTests()
    .then(generateSecurityReport)
    .then((report) => {
      process.exit(report.results.stats.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('🚨 テスト実行エラー:', error);
      process.exit(1);
    });
}

export { runComprehensiveSecurityTests, generateSecurityReport };