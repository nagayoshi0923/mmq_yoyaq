# セキュリティ監査レポート

**監査日**: 2025-01-XX  
**対象システム**: MMQ Yoyaq（マーダーミステリー店舗管理システム）  
**監査範囲**: フロントエンド、バックエンド、認証、データベース、インフラ

---

## 📋 システム概要

- **フロントエンド**: React + TypeScript (Vite)
- **バックエンド**: Supabase (Edge Functions)
- **認証方式**: Supabase Auth (メール/パスワード + Magic Link)
- **インフラ**: Vercel (フロントエンド) + Supabase (バックエンド/DB)
- **DB**: PostgreSQL (Supabase)
- **決済**: 決済処理は未実装（`payment_status` フィールドはあるが決済API連携なし）

---

## 🔒 1. 通信の安全性

### ✅ 実装済み

- **HTTPS/TLS**: Vercelが自動的にHTTPSを提供（デフォルトで有効）
- **Supabase接続**: SupabaseクライアントはHTTPS接続を使用

### ⚠️ 不十分な点

- **セキュリティヘッダー未設定**
  - `Content-Security-Policy (CSP)` が未設定
  - `Strict-Transport-Security (HSTS)` が未設定
  - `X-Frame-Options` が未設定
  - `X-Content-Type-Options` が未設定
  - `Referrer-Policy` が未設定

**影響度**: 中  
**優先度**: 今すぐ直すべき

**改善案**:
```json
// vercel.json に追加
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';"
        }
      ]
    }
  ]
}
```

---

## 🔐 2. 認証・認可

### ✅ 実装済み

- **パスワード保存**: Supabase Authがbcryptハッシュ + saltで管理（実装詳細はSupabase側）
- **セッション管理**: 
  - JWTトークンを使用
  - `autoRefreshToken: true` で自動リフレッシュ
  - `flowType: 'pkce'` でPKCEフロー実装
  - 複数タブ間の同期（BroadcastChannel API）
- **権限分離**: 
  - `admin`, `staff`, `customer`, `license_admin` の4ロール
  - ロールベースアクセス制御実装済み
- **IDOR対策**: 
  - RLS（Row Level Security）が全テーブルで有効
  - マルチテナント対応（`organization_id` フィルタ）
  - 顧客は自分のデータのみアクセス可能

### ⚠️ 不十分な点

- **レート制限**: Supabase Authのデフォルトレート制限に依存（明示的な実装なし）
  - ログイン試行回数制限はSupabase側で管理されているが、フロントエンド側での追加制限なし

**影響度**: 低（Supabaseが保護しているため）  
**優先度**: 後回し可

**改善案**:
```typescript
// ログイン試行回数をローカルストレージで追跡
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15分
```

---

## 🛡️ 3. 入力・API安全性

### ✅ 実装済み

- **XSS対策**: 
  - `dangerouslySetInnerHTML` の使用なし（検索結果で0件）
  - Reactのデフォルトエスケープ機能を活用
- **SQLインジェクション対策**: 
  - Supabaseクライアントを使用（パラメータ化クエリ）
  - 直接SQL文字列連結なし
- **バリデーション**: 
  - フロントエンドで基本的なバリデーション実装
  - 例: `validateForm()` 関数で必須チェック
- **二重送信対策**: 
  - `isSubmitting` フラグで送信中の状態管理
  - 重複予約チェック機能あり（`checkDuplicateReservation`）

### ⚠️ 不十分な点

- **サーバーサイドバリデーション**: Edge Functionsでのバリデーションが不十分な可能性
  - フロントエンドのバリデーションのみに依存している箇所がある

**影響度**: 中  
**優先度**: 今すぐ直すべき

**改善案**:
```typescript
// Edge Functionsでバリデーションを実装
import { z } from 'zod'

const reservationSchema = z.object({
  customerEmail: z.string().email(),
  customerPhone: z.string().regex(/^[0-9-]+$/),
  participantCount: z.number().min(1).max(20)
})
```

---

## 🔒 4. データ保護

### ✅ 実装済み

- **個人情報の保存**: 
  - データベースに暗号化保存（Supabaseのデフォルト）
  - 顧客情報は `customers` テーブルで管理
- **ログ**: 
  - 認証イベントログ（`auth_logs` テーブル）実装済み
  - ログレベル分離（開発/本番）

### ❌ 危険な点

- **ログに個人情報が含まれている**
  - `logger.log()` でメールアドレスが出力されている箇所が多数
  - 例: `logger.log('✅ ログイン成功:', data.user?.email)`
  - 本番環境でも `logger.error()` は出力されるため、メールアドレスがログに残る可能性

**影響度**: 高  
**優先度**: 今すぐ直すべき

**改善案**:
```typescript
// メールアドレスのマスキング関数を作成
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

// 使用例
logger.log('✅ ログイン成功:', maskEmail(data.user?.email || ''))
```

- **環境変数のハードコード**
  - `src/lib/supabase.ts` にSupabase URLとAnon Keyがハードコードされている
  - フォールバック値として使用されているが、リポジトリに含まれている

**影響度**: 中  
**優先度**: 今すぐ直すべき

**改善案**:
```typescript
// ハードコードを削除し、環境変数のみに依存
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase環境変数が設定されていません')
}
```

---

## 🚨 5. 運用・事故耐性

### ✅ 実装済み

- **二重送信対策**: 
  - `isSubmitting` フラグで送信中の状態管理
  - 重複予約チェック機能あり
- **ログ・監査ログ**: 
  - `auth_logs` テーブルで認証イベントを記録
  - ログイン/ログアウト/ロール変更を記録
- **エラーハンドリング**: 
  - try-catch ブロックでエラーを捕捉
  - ユーザーフレンドリーなエラーメッセージ表示

### ⚠️ 不十分な点

- **バックアップ**: Supabaseの自動バックアップに依存（明示的なバックアップ戦略のドキュメントなし）
- **異常検知**: ログは記録されているが、異常パターンの自動検知機能なし

**影響度**: 低  
**優先度**: 後回し可

**改善案**:
- Supabase Dashboardでバックアップ設定を確認
- 異常ログイン検知のアラート設定（Supabase Functionsで実装可能）

---

## 📊 総合評価

### セキュリティレベル: ⚠️ 中（改善が必要）

**強み**:
- RLSによる多層防御
- マルチテナント対応の実装
- XSS対策が適切
- 認証ログの記録

**改善が必要な点**:
1. **セキュリティヘッダーの設定**（優先度: 高）
2. **ログからの個人情報除去**（優先度: 高）
3. **環境変数のハードコード削除**（優先度: 高）
4. **サーバーサイドバリデーションの強化**（優先度: 中）

---

## 🎯 アクションプラン

### 今すぐ直すべき（1週間以内）

1. ✅ `vercel.json` にセキュリティヘッダーを追加
2. ✅ ログ出力からメールアドレスをマスキング
3. ✅ ハードコードされたSupabaseキーを削除
4. ✅ Edge Functionsにバリデーションを追加

### 後回し可（1ヶ月以内）

1. ⏳ ログイン試行回数制限の追加実装
2. ⏳ バックアップ戦略のドキュメント化
3. ⏳ 異常検知アラートの実装

---

## 📝 補足情報

### 決済について

- `payment_status` フィールドは存在するが、決済API連携は未実装
- 決済機能を追加する場合は、PCI DSS準拠の決済プロバイダー（Stripe等）を使用すること

### マルチテナントセキュリティ

- `organization_id` によるデータ分離が適切に実装されている
- RLSポリシーで多層防御が実現されている
- コード側でも `organization_id` フィルタが推奨されている（ルールファイル参照）

---

**監査実施者**: AI Security Auditor  
**次回監査推奨日**: 3ヶ月後（または重大な変更後）

