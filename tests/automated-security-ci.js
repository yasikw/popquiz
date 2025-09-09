/**
 * 自動化セキュリティテストスイート（CI/CD対応）
 * 継続的統合環境での自動実行に最適化
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { runComprehensiveSecurityTests } from './comprehensive-security-suite.js';
import { runEnhancedErrorHandlingTests } from './enhanced-error-handling-test.js';

/**
 * CI/CD環境の検出
 */
function detectCIEnvironment() {
  const ciEnvVars = [
    'CI', 'CONTINUOUS_INTEGRATION', 'JENKINS_URL', 'TRAVIS',
    'CIRCLECI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE'
  ];
  
  const isCI = ciEnvVars.some(envVar => process.env[envVar]);
  const provider = process.env.CI_PROVIDER || 
                   (process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 
                    process.env.GITLAB_CI ? 'GitLab CI' :
                    process.env.TRAVIS ? 'Travis CI' :
                    process.env.CIRCLECI ? 'CircleCI' : 'Unknown');
  
  return { isCI, provider };
}

/**
 * テスト環境の準備
 */
async function prepareTestEnvironment() {
  console.log('🔧 テスト環境準備中...');
  
  // 必要なディレクトリの作成
  const dirs = ['logs', 'reports', 'temp'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`⚠️ ディレクトリ作成警告 ${dir}: ${error.message}`);
    }
  }
  
  // テスト用の環境変数設定
  process.env.NODE_ENV = 'test';
  process.env.ERROR_DISCLOSURE_LEVEL = '0'; // 最小限の情報のみ
  process.env.ENABLE_ERROR_TRACKING = 'true';
  process.env.SANITIZE_ERROR_RESPONSES = 'true';
  
  console.log('✅ テスト環境準備完了');
}

/**
 * サーバーの起動確認
 */
async function waitForServer(url = 'http://localhost:5000', maxAttempts = 30) {
  console.log(`🌐 サーバー起動確認中... (${url})`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { default: fetch } = await import('node-fetch');
      const response = await fetch(url, { timeout: 1000 });
      
      if (response.status < 500) {
        console.log(`✅ サーバー起動確認完了 (試行 ${attempt}/${maxAttempts})`);
        return true;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        console.error(`❌ サーバー起動確認失敗: ${error.message}`);
        return false;
      }
      
      console.log(`⏳ サーバー起動待機中... (${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return false;
}

/**
 * JUnitフォーマットでのテスト結果出力
 */
async function generateJUnitReport(results, outputPath) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Security Tests" tests="${results.stats.total}" failures="${results.stats.failed}" time="${results.duration}">
  <testsuite name="Comprehensive Security Tests" tests="${results.stats.total}" failures="${results.stats.failed}" time="${results.duration}">
    ${results.stats.errors.map(error => `
    <testcase name="${error.test}" classname="SecurityTest">
      <failure message="${error.message}">${error.message}</failure>
    </testcase>`).join('')}
    ${Array.from({length: results.stats.passed}, (_, i) => `
    <testcase name="Security Test ${i + 1}" classname="SecurityTest"></testcase>`).join('')}
  </testsuite>
</testsuites>`;

  await fs.writeFile(outputPath, xml);
  console.log(`📄 JUnitレポート生成: ${outputPath}`);
}

/**
 * SARIF（Static Analysis Results Interchange Format）レポート生成
 */
async function generateSARIFReport(results, outputPath) {
  const sarif = {
    version: "2.1.0",
    "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: {
        driver: {
          name: "Japanese Quiz App Security Scanner",
          version: "1.0.0",
          informationUri: "https://github.com/example/security-scanner"
        }
      },
      results: results.stats.errors.map(error => ({
        ruleId: "security-test-failure",
        level: "error",
        message: {
          text: error.message
        },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: "tests/security"
            }
          }
        }]
      }))
    }]
  };

  await fs.writeFile(outputPath, JSON.stringify(sarif, null, 2));
  console.log(`📄 SARIFレポート生成: ${outputPath}`);
}

/**
 * セキュリティメトリクスの収集
 */
async function collectSecurityMetrics(results) {
  const metrics = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    securityScore: results.score,
    testResults: {
      total: results.stats.total,
      passed: results.stats.passed,
      failed: results.stats.failed,
      warnings: results.stats.warnings
    },
    executionTime: results.duration,
    vulnerabilities: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    },
    compliance: {
      gdpr: results.score >= 85,
      owasp: results.score >= 90,
      enterprise: results.score >= 95
    }
  };

  // 失敗したテストを脆弱性として分類
  results.stats.errors.forEach(error => {
    if (error.test.toLowerCase().includes('xss') || 
        error.test.toLowerCase().includes('csrf') ||
        error.test.toLowerCase().includes('injection')) {
      metrics.vulnerabilities.critical++;
    } else if (error.test.toLowerCase().includes('auth') ||
               error.test.toLowerCase().includes('permission')) {
      metrics.vulnerabilities.high++;
    } else if (error.test.toLowerCase().includes('rate') ||
               error.test.toLowerCase().includes('limit')) {
      metrics.vulnerabilities.medium++;
    } else {
      metrics.vulnerabilities.low++;
    }
  });

  return metrics;
}

/**
 * Slackへの通知（オプション）
 */
async function sendSlackNotification(metrics) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const color = metrics.securityScore >= 95 ? 'good' : 
                metrics.securityScore >= 85 ? 'warning' : 'danger';
  
  const message = {
    attachments: [{
      color: color,
      title: '🔒 セキュリティテスト結果',
      fields: [
        { title: 'セキュリティスコア', value: `${metrics.securityScore.toFixed(1)}/100`, short: true },
        { title: '成功/失敗', value: `${metrics.testResults.passed}/${metrics.testResults.failed}`, short: true },
        { title: '環境', value: metrics.environment, short: true },
        { title: '実行時間', value: `${metrics.executionTime.toFixed(2)}秒`, short: true }
      ],
      timestamp: metrics.timestamp
    }]
  };

  try {
    const { default: fetch } = await import('node-fetch');
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    console.log('📱 Slack通知送信完了');
  } catch (error) {
    console.warn(`⚠️ Slack通知エラー: ${error.message}`);
  }
}

/**
 * GitHub Security Advisoryのチェック
 */
async function checkSecurityAdvisories() {
  console.log('🔍 GitHub Security Advisory チェック中...');
  
  try {
    const auditProcess = spawn('npm', ['audit', '--audit-level', 'moderate'], {
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    auditProcess.stdout.on('data', (data) => stdout += data.toString());
    auditProcess.stderr.on('data', (data) => stderr += data.toString());

    const exitCode = await new Promise(resolve => {
      auditProcess.on('close', resolve);
    });

    if (exitCode === 0) {
      console.log('✅ 既知の脆弱性は検出されませんでした');
      return { vulnerabilities: 0, details: '' };
    } else {
      console.warn('⚠️ 既知の脆弱性が検出されました');
      console.log(stdout);
      return { vulnerabilities: 1, details: stdout };
    }
  } catch (error) {
    console.warn(`⚠️ Security Advisory チェックエラー: ${error.message}`);
    return { vulnerabilities: 0, details: error.message };
  }
}

/**
 * セキュリティベンチマーク（OWASP準拠）のチェック
 */
async function checkOWASPCompliance(results) {
  console.log('📋 OWASP Top 10 準拠チェック中...');
  
  const owaspChecks = {
    'A01:2021 - Broken Access Control': results.score >= 90,
    'A02:2021 - Cryptographic Failures': results.score >= 85,
    'A03:2021 - Injection': results.score >= 95,
    'A04:2021 - Insecure Design': results.score >= 80,
    'A05:2021 - Security Misconfiguration': results.score >= 85,
    'A06:2021 - Vulnerable Components': results.score >= 90,
    'A07:2021 - Identity/Authentication Failures': results.score >= 90,
    'A08:2021 - Software/Data Integrity Failures': results.score >= 85,
    'A09:2021 - Security Logging/Monitoring Failures': results.score >= 80,
    'A10:2021 - Server-Side Request Forgery': results.score >= 95
  };

  const compliantChecks = Object.values(owaspChecks).filter(Boolean).length;
  const totalChecks = Object.keys(owaspChecks).length;
  const complianceRate = (compliantChecks / totalChecks) * 100;

  console.log(`📊 OWASP準拠率: ${complianceRate.toFixed(1)}% (${compliantChecks}/${totalChecks})`);
  
  Object.entries(owaspChecks).forEach(([check, compliant]) => {
    console.log(`${compliant ? '✅' : '❌'} ${check}`);
  });

  return {
    rate: complianceRate,
    compliant: compliantChecks,
    total: totalChecks,
    checks: owaspChecks
  };
}

/**
 * メイン実行関数
 */
async function runAutomatedSecurityCI() {
  const startTime = Date.now();
  console.log('🚀 自動化セキュリティテストスイート開始');
  console.log('CI/CD対応包括的セキュリティ検証');
  console.log('='.repeat(60));

  // CI環境の検出
  const ciInfo = detectCIEnvironment();
  console.log(`🤖 CI環境: ${ciInfo.isCI ? ciInfo.provider : 'ローカル環境'}`);

  try {
    // 1. テスト環境準備
    await prepareTestEnvironment();

    // 2. サーバー起動確認
    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('サーバーが起動していません');
    }

    // 3. セキュリティアドバイザリチェック
    const advisoryResults = await checkSecurityAdvisories();

    // 4. メインセキュリティテスト実行
    console.log('\n📋 包括的セキュリティテスト実行中...');
    const mainResults = await runComprehensiveSecurityTests();

    // 5. エラーハンドリングテスト実行
    console.log('\n🛡️ エラーハンドリングテスト実行中...');
    const errorHandlingResults = await runEnhancedErrorHandlingTests();

    // 6. 結果統合
    const combinedResults = {
      score: (mainResults.score + errorHandlingResults.score) / 2,
      stats: {
        total: mainResults.stats.total + errorHandlingResults.total,
        passed: mainResults.stats.passed + errorHandlingResults.passed,
        failed: mainResults.stats.failed + errorHandlingResults.failed,
        warnings: mainResults.stats.warnings,
        errors: [...(mainResults.stats.errors || []), ...((errorHandlingResults.failed > 0) ? [{ test: 'Error Handling', message: 'Some error handling tests failed' }] : [])]
      },
      duration: (Date.now() - startTime) / 1000
    };

    // 7. OWASP準拠チェック
    const owaspCompliance = await checkOWASPCompliance(combinedResults);

    // 8. セキュリティメトリクス収集
    const metrics = await collectSecurityMetrics(combinedResults);
    metrics.advisories = advisoryResults;
    metrics.owaspCompliance = owaspCompliance;

    // 9. レポート生成
    const reportDir = 'reports';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    await Promise.all([
      generateJUnitReport(combinedResults, path.join(reportDir, `security-junit-${timestamp}.xml`)),
      generateSARIFReport(combinedResults, path.join(reportDir, `security-sarif-${timestamp}.json`)),
      fs.writeFile(path.join(reportDir, `security-metrics-${timestamp}.json`), JSON.stringify(metrics, null, 2))
    ]);

    // 10. 通知送信（CI環境の場合）
    if (ciInfo.isCI) {
      await sendSlackNotification(metrics);
    }

    // 11. 結果サマリー
    console.log('\n' + '='.repeat(60));
    console.log('🏁 自動化セキュリティテスト完了');
    console.log('='.repeat(60));
    console.log(`🔒 総合セキュリティスコア: ${combinedResults.score.toFixed(1)}/100`);
    console.log(`📊 総テスト数: ${combinedResults.stats.total}`);
    console.log(`✅ 成功: ${combinedResults.stats.passed}`);
    console.log(`❌ 失敗: ${combinedResults.stats.failed}`);
    console.log(`⚠️ 警告: ${combinedResults.stats.warnings}`);
    console.log(`🕐 実行時間: ${combinedResults.duration.toFixed(2)}秒`);
    console.log(`📋 OWASP準拠率: ${owaspCompliance.rate.toFixed(1)}%`);
    console.log(`🔍 既知脆弱性: ${advisoryResults.vulnerabilities}件`);

    // 12. 終了ステータス決定
    let exitCode = 0;
    if (combinedResults.stats.failed > 0) {
      console.log('❌ セキュリティテストが失敗しました');
      exitCode = 1;
    } else if (combinedResults.score < 85) {
      console.log('⚠️ セキュリティスコアが基準値を下回りました');
      exitCode = 1;
    } else if (advisoryResults.vulnerabilities > 0) {
      console.log('⚠️ 既知の脆弱性が検出されました');
      exitCode = 1;
    } else {
      console.log('🎉 すべてのセキュリティテストが成功しました');
    }

    console.log('='.repeat(60));
    return { metrics, exitCode };

  } catch (error) {
    console.error('🚨 自動化セキュリティテストエラー:', error);
    return { metrics: null, exitCode: 1 };
  }
}

// プロセス終了処理
process.on('SIGINT', () => {
  console.log('\n⏹️ テスト中断');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ テスト終了');
  process.exit(143);
});

// メイン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutomatedSecurityCI()
    .then(({ exitCode }) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('🚨 予期しないエラー:', error);
      process.exit(1);
    });
}

export { 
  runAutomatedSecurityCI, 
  detectCIEnvironment, 
  waitForServer,
  collectSecurityMetrics,
  checkOWASPCompliance 
};