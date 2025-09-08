# 🚀 DocuQuery 本番デプロイメント最終チェックリスト

## 📋 デプロイ前必須チェック項目

### 1. 🔐 環境変数設定（必須）

#### セキュリティ関連
- [ ] **NODE_ENV=production** - 本番環境モード有効化
- [ ] **JWT_SECRET** - 32文字以上のランダム文字列
- [ ] **SESSION_SECRET** - 32文字以上のランダム文字列（JWT_SECRETと異なる値）
- [ ] **GEMINI_API_KEY** - 実際のGoogle Gemini APIキー

#### CORS・ドメイン設定
- [ ] **ALLOWED_ORIGINS** - 実際の本番ドメイン（例：`https://yourdomain.com,https://www.yourdomain.com`）
- [ ] **FORCE_HTTPS=true** - HTTPS強制有効化

#### データベース設定
- [ ] **DATABASE_URL** - 本番データベース接続文字列（SSL有効：`sslmode=require`）

### 2. 🛡️ セキュリティ設定確認

#### HTTPS・SSL設定
- [ ] **HTTPS強制** - すべてのHTTPリクエストをHTTPSにリダイレクト
- [ ] **HSTS設定** - Strict-Transport-Security ヘッダー有効
- [ ] **SSL証明書** - 有効期限内の証明書設定

#### セキュリティヘッダー
- [ ] **CSP（Content Security Policy）** - 適切なポリシー設定
- [ ] **X-Frame-Options** - DENY設定でClickjacking防止
- [ ] **X-Content-Type-Options** - nosniff設定
- [ ] **CSRF保護** - トークンベース保護有効

### 3. ⚡ パフォーマンス設定最適化

#### キャッシュ設定（本番用）
- [ ] **SafeCache TTL** - 2時間（7,200,000ms）に設定
- [ ] **キャッシュサイズ** - 最大200エントリに設定
- [ ] **自動クリーンアップ** - 20%削除で最適化

#### Rate Limiting（本番推奨値）
- [ ] **API_RATE_LIMIT=200** - API呼び出し制限（時間）
- [ ] **UPLOAD_RATE_LIMIT=20** - ファイルアップロード制限（時間）
- [ ] **AUTH_RATE_LIMIT=10** - 認証試行制限（15分）
- [ ] **REGISTER_RATE_LIMIT=5** - 登録試行制限（時間）
- [ ] **QUIZ_RATE_LIMIT=50** - クイズ生成制限（時間）

### 4. 🗄️ データベース設定

#### 接続・パフォーマンス
- [ ] **SSL接続** - 必須（`sslmode=require`）
- [ ] **接続プール** - `DB_POOL_SIZE=20`
- [ ] **タイムアウト** - `DB_CONNECTION_TIMEOUT=30000`

#### バックアップ
- [ ] **自動バックアップ** - 日次バックアップ設定
- [ ] **リストア手順** - 緊急時の復旧手順確認

### 5. 📊 監視・ログ設定

#### ログレベル
- [ ] **LOG_LEVEL=warn** - 本番用ログレベル
- [ ] **LOG_FORMAT=json** - 構造化ログ形式
- [ ] **セキュリティログ** - 不正アクセス試行の記録

#### 監視項目
- [ ] **アプリケーション監視** - 稼働状況・エラー率
- [ ] **メモリ使用量監視** - `MAX_MEMORY_USAGE=1024` (MB)
- [ ] **CPU使用率監視** - `MAX_CPU_USAGE=80`%

### 6. 🔧 アプリケーション設定

#### ファイルアップロード
- [ ] **MAX_FILE_SIZE=10485760** - 10MB制限
- [ ] **ALLOWED_FILE_TYPES** - `pdf,txt,doc,docx`のみ許可
- [ ] **ウイルススキャン** - `VIRUS_SCAN_ENABLED=true`（推奨）

#### セッション管理
- [ ] **セッションタイムアウト** - 適切な期限設定
- [ ] **Secure Cookie** - 本番環境でのみ送信

### 7. 🌐 ドメイン・DNS設定

#### DNS設定
- [ ] **Aレコード** - サーバーIPアドレス設定
- [ ] **CNAMEレコード** - www サブドメイン設定
- [ ] **SSL証明書** - Let's Encrypt または有料SSL

#### CORS許可リスト
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://api.yourdomain.com
```

### 8. 🧪 デプロイ前テスト

#### 機能テスト
- [ ] **ユーザー認証** - ログイン・ログアウト
- [ ] **クイズ生成** - PDF・テキスト・YouTube対応
- [ ] **ファイルアップロード** - セキュリティ制限確認
- [ ] **API エンドポイント** - 全エンドポイント動作確認

#### セキュリティテスト
- [ ] **CORS違反テスト** - 不正ドメインからのアクセス拒否
- [ ] **Rate Limitingテスト** - 制限値での動作確認
- [ ] **XSS防止テスト** - 入力サニタイゼーション確認
- [ ] **CSRF保護テスト** - トークン検証確認

## 🎯 本番環境変数テンプレート

```bash
# === DocuQuery 本番環境設定 ===

# 基本設定
NODE_ENV=production
PORT=5000

# ドメイン・CORS設定
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
FORCE_HTTPS=true

# セキュリティ設定
JWT_SECRET=YOUR_64_CHAR_RANDOM_HEX_STRING_FOR_JWT
SESSION_SECRET=YOUR_DIFFERENT_64_CHAR_RANDOM_HEX_STRING_FOR_SESSION

# データベース設定（SSL必須）
DATABASE_URL=postgresql://username:password@host:5432/database?sslmode=require
DB_POOL_SIZE=20
DB_CONNECTION_TIMEOUT=30000

# API設定
GEMINI_API_KEY=your_actual_gemini_api_key

# Rate Limiting（本番推奨値）
API_RATE_LIMIT=200
UPLOAD_RATE_LIMIT=20
AUTH_RATE_LIMIT=10
REGISTER_RATE_LIMIT=5
QUIZ_RATE_LIMIT=50

# SSL・HSTS設定
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=true

# パフォーマンス設定
MAX_MEMORY_USAGE=1024
MAX_CPU_USAGE=80
WORKER_THREADS=4

# ログ設定
LOG_LEVEL=warn
LOG_FORMAT=json
AUDIT_LOG_ENABLED=true

# ファイルアップロード設定
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,txt,doc,docx
VIRUS_SCAN_ENABLED=true
```

## ⚠️ 重要な注意事項

### セキュリティ警告
1. **JWT_SECRET** と **SESSION_SECRET** は必ず異なる値を使用
2. 本番環境では必ず **HTTPS** を使用
3. **ALLOWED_ORIGINS** には実際のドメインのみ設定
4. データベース接続には必ず **SSL** を使用

### パフォーマンス最適化
1. **キャッシュ設定** は本番環境で自動調整（TTL: 2時間, サイズ: 200）
2. **Rate Limiting** 値は業務量に応じて調整
3. **メモリ監視** は必須（1GB推奨）

### 監視・運用
1. **セキュリティログ** の定期確認
2. **エラー率** の監視設定
3. **バックアップ** の自動化とテスト

## ✅ デプロイ準備完了確認

全ての項目をチェック後、以下を実行：

```bash
# 本番設定検証
npm run validate:production

# セキュリティテスト実行
npm run test:security

# 本番ビルド
npm run build:production
```

**🎉 すべてのチェック項目が完了した場合、DocuQueryは本番デプロイ準備完了です！**