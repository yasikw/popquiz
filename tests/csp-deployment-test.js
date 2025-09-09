/**
 * CSP段階的デプロイメントシステム動作確認スクリプト
 */

const baseUrl = 'http://localhost:5000';

async function testCSPDeploymentSystem() {
  console.log('🚀 CSP段階的デプロイメントシステムテスト開始\n');

  try {
    // 1. 現在の統計情報確認
    console.log('📊 Step 1: 現在のCSP統計確認');
    const statsResponse = await fetch(`${baseUrl}/api/csp-stats`);
    const stats = await statsResponse.json();
    console.log('✅ CSP統計:', stats.data);

    // 2. Level1 設定確認
    console.log('\n🔍 Step 2: Level1 (Report-Only) 設定確認');
    const level1Response = await fetch(`${baseUrl}/api/csrf-token`);
    const cspHeader = level1Response.headers.get('content-security-policy-report-only');
    
    if (cspHeader) {
      console.log('✅ Report-Only モード確認:', cspHeader.length > 100 ? 'CSPヘッダー設定済み' : 'ヘッダー短い');
      console.log('   unsafe-inline許可:', cspHeader.includes("'unsafe-inline'") ? '✅' : '❌');
      console.log('   unsafe-eval許可:', cspHeader.includes("'unsafe-eval'") ? '✅' : '❌');
    } else {
      console.log('❌ Report-Only ヘッダーが見つかりません');
    }

    // 3. デモ違反レポート送信
    console.log('\n📤 Step 3: デモCSP違反レポート送信');
    const demoViolations = [
      {
        'csp-report': {
          'document-uri': 'http://localhost:5000/',
          'referrer': '',
          'violated-directive': 'script-src',
          'effective-directive': 'script-src',
          'original-policy': "default-src 'self'",
          'disposition': 'report',
          'blocked-uri': 'inline',
          'status-code': 200,
          'script-sample': 'console.log("test")'
        }
      },
      {
        'csp-report': {
          'document-uri': 'http://localhost:5000/login',
          'referrer': '',
          'violated-directive': 'style-src',
          'effective-directive': 'style-src',
          'original-policy': "default-src 'self'",
          'disposition': 'report',
          'blocked-uri': 'inline',
          'status-code': 200,
          'script-sample': ''
        }
      },
      {
        'csp-report': {
          'document-uri': 'http://localhost:5000/quiz',
          'referrer': '',
          'violated-directive': 'script-src',
          'effective-directive': 'script-src',
          'original-policy': "default-src 'self'",
          'disposition': 'report',
          'blocked-uri': 'eval',
          'status-code': 200,
          'script-sample': 'eval("test")'
        }
      }
    ];

    for (const violation of demoViolations) {
      const reportResponse = await fetch(`${baseUrl}/api/csp-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(violation)
      });
      
      if (reportResponse.status === 204) {
        console.log(`✅ 違反レポート送信成功: ${violation['csp-report']['violated-directive']}`);
      } else {
        console.log(`❌ 違反レポート送信失敗: ${reportResponse.status}`);
      }
      
      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 4. Level2への移行テスト
    console.log('\n🔄 Step 4: Level2移行テスト');
    const level2Response = await fetch(`${baseUrl}/api/csp-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'level2' })
    });
    
    if (level2Response.ok) {
      const level2Result = await level2Response.json();
      console.log('✅ Level2移行:', level2Result.message);
      
      // Level2ヘッダー確認
      const level2HeaderResponse = await fetch(`${baseUrl}/api/csrf-token`);
      const enforcedCSP = level2HeaderResponse.headers.get('content-security-policy');
      const reportOnlyCSP = level2HeaderResponse.headers.get('content-security-policy-report-only');
      
      console.log('   Enforced CSP:', enforcedCSP ? '✅ 設定済み' : '❌ なし');
      console.log('   Report-Only CSP:', reportOnlyCSP ? '⚠️ まだ残存' : '✅ 削除済み');
    }

    // 5. Level3への移行テスト
    console.log('\n🔒 Step 5: Level3（最終）移行テスト');
    const level3Response = await fetch(`${baseUrl}/api/csp-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'level3' })
    });
    
    if (level3Response.ok) {
      const level3Result = await level3Response.json();
      console.log('✅ Level3移行:', level3Result.message);
      
      // Level3ヘッダー確認
      const level3HeaderResponse = await fetch(`${baseUrl}/api/csrf-token`);
      const strictCSP = level3HeaderResponse.headers.get('content-security-policy');
      
      if (strictCSP) {
        console.log('   Strict CSP設定:', '✅ 有効');
        console.log('   unsafe-inline除去:', !strictCSP.includes("'unsafe-inline'") ? '✅' : '❌');
        console.log('   unsafe-eval除去:', !strictCSP.includes("'unsafe-eval'") ? '✅' : '❌');
      }
    }

    // 6. Level1に戻して本番環境準備
    console.log('\n🔄 Step 6: Level1 (Report-Only) に戻して段階的デプロイ準備');
    await fetch(`${baseUrl}/api/csp-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'level1' })
    });
    
    console.log('✅ Level1 (Report-Only) 復帰完了');

    console.log('\n🎯 段階的デプロイメント計画:');
    console.log('📅 Week 1: Level1 (Report-Only) - 違反パターン収集');
    console.log('📊 Week 2: 違反分析・修正作業');
    console.log('🛡️ Week 3: Level2 (段階的強化) 適用');
    console.log('🔒 Week 4: Level3 (厳格モード) 移行');
    
    console.log('\n📈 監視・分析機能:');
    console.log('• CSP違反レポートの自動収集');
    console.log('• 重要度別違反分析');
    console.log('• Level2移行準備状況評価');
    console.log('• 週次セキュリティレポート');
    console.log('• アラート・通知システム');

  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
  }

  console.log('\n🏁 CSP段階的デプロイメントシステムテスト完了');
}

// テスト実行
testCSPDeploymentSystem().catch(console.error);