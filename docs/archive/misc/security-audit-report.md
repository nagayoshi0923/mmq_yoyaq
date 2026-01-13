# セキュリティ監査レポート

**監査日**: 2026-01-12  
**対象システム**: MMQ Yoyaq（マーダーミステリー店舗管理システム）  
**監査範囲**: フロントエンド、バックエンド、認証、データベース、インフラ

---

## 📋 システム概要

- **フロントエンド**: React + TypeScript (Vite)
- **バックエンド**: Supabase (Edge Functions)
- **認証方式**: Supabase Auth (メール/パスワード + Magic Link + PKCE)
- **インフラ**: Vercel (フロントエンド) + Supabase (バックエンド/DB)
- **DB**: PostgreSQL (Supabase)
- **決済**: 決済処理は未実装（現地決済のみ）

---

## 🔒 1. 通信の安全性

### ✅ 実装済み

- **HTTPS/TLS**: Vercelが自動的にHTTPSを提供（TLS 1.3対応）
- **Supabase接続**: SupabaseクライアントはHTTPS接続を使用
- **セキュリティヘッダー**: ✅ **対応完了**（2026-01-12）
  - `Strict-Transport-Security (HSTS)` - 設定済み
  - `X-Frame-Options: DENY` - 設定済み
  - `X-Content-Type-Options: nosniff` - 設定済み
  - `Referrer-Policy: strict-origin-when-cross-origin` - 設定済み
  - `Permissions-Policy` - 設定済み

### ⚠️ 不十分な点

- **Content-Security-Policy (CSP)**: 未設定（Reactアプリとの互換性を考慮し慎重に設定が必要）

**影響度**: 低  
**優先度**: 後回し可

---

## 🔐 2. 認証・認可

### ✅ 実装済み

- **パスワード保存**: Supabase Authがbcryptハッシュ + saltで管理
- **セッション管理**: 
  - JWTトークンを使用
  - `autoRefreshToken: true` で自動リフレッシュ
  - `flowType: 'pkce'` でPKCEフロー実装（OAuth最新セキュリティ）
  - 複数タブ間の同期（BroadcastChannel API）
  - タブアクティブ時のセッション再検証
- **権限分離**: 
  - `admin`, `staff`, `customer`, `license_admin` の4ロール
  - ロールベースアクセス制御実装済み
- **IDOR対策**: 
  - RLS（Row Level Security）が全27テーブルで有効
  - マルチテナント対応（`organization_id` フィルタ）
  - 顧客は自分のデータのみアクセス可能
- **Edge Functions認証**: ✅ **対応完了**（2026-01-12）
  - `delete-user` - 管理者認証必須
  - `invite-staff` - 管理者認証必須

### ⚠️ 不十分な点

- **レート制限**: Supabase Authのデフォルトレート制限に依存

**影響度**: 低（Supabaseが保護しているため）  
**優先度**: 後回し可

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
  - Edge Functionsでも入力チェック実装
- **二重送信対策**: 
  - `isSubmitting` フラグで送信中の状態管理
  - 重複予約チェック機能あり
- **CORS設定**: ✅ **対応完了**（2026-01-12）
  - 許可オリジンを本番ドメインに制限
  - `_shared/security.ts` で共通管理

---

## 🔒 4. データ保護

### ✅ 実装済み

- **個人情報の保存**: 
  - データベースに暗号化保存（Supabaseのデフォルト）
  - 顧客情報は `customers` テーブルで管理
  - RLSで本人のみアクセス可能
- **ログ**: 
  - 認証イベントログ（`auth_logs` テーブル）実装済み
  - ログレベル分離（開発/本番）
- **ログマスキング**: ✅ **対応完了**（2026-01-12）
  - Edge Functionsで個人情報をマスキング
  - `maskEmail()`, `maskName()`, `maskPhone()` ヘルパー関数
- **バックアップ**: Supabase自動バックアップ（Pro以上で毎日）

### ⚠️ 注意点

- **環境変数のフォールバック値**
  - `src/lib/supabase.ts` にフォールバック値があるが、本番環境では環境変数を使用

**影響度**: 低  
**優先度**: 後回し可

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

- **インシデント対応フロー**: 未文書化
- **異常検知アラート**: 未実装

**影響度**: 低  
**優先度**: 後回し可

---

## 📊 総合評価

### セキュリティレベル: ✅ 良好

**強み**:
- ✅ RLSによる多層防御（27テーブル）
- ✅ マルチテナント対応の実装
- ✅ XSS/SQLi対策が適切
- ✅ 認証ログの記録
- ✅ セキュリティヘッダー設定済み
- ✅ Edge Functions認証チェック
- ✅ CORS制限
- ✅ ログマスキング

**「一般的なWebサービスとして問題ない水準」をクリア**

---

## 🎯 対応履歴

### 2026-01-12 対応完了

| 項目 | 状態 | 対応内容 |
|------|------|----------|
| セキュリティヘッダー | ✅ 完了 | `vercel.json` に HSTS, X-Frame-Options 等を追加 |
| Edge Functions認証 | ✅ 完了 | `delete-user`, `invite-staff` に管理者認証チェックを追加 |
| CORS制限 | ✅ 完了 | 許可オリジンを本番ドメインに制限 |
| ログマスキング | ✅ 完了 | `_shared/security.ts` でマスキング関数を実装 |

### 今後の推奨対応

| 優先度 | 項目 | 説明 |
|--------|------|------|
| 低 | CSP設定 | Content-Security-Policyの追加（要動作検証） |
| 低 | Rate Limiting | ログイン試行回数制限の強化 |
| 低 | インシデント対応フロー | 事故発生時の対応手順書作成 |

---

## 📝 関連ドキュメント

| ファイル | 説明 |
|----------|------|
| `docs/development/multi-tenant-security.md` | マルチテナントセキュリティガイド |
| `docs/development/edge-functions-security.md` | Edge Functionsセキュリティガイド |
| `supabase/functions/_shared/security.ts` | 共通セキュリティヘルパー |

---

**監査実施者**: AI Security Auditor  
**次回監査推奨日**: 3ヶ月後（または重大な変更後）
