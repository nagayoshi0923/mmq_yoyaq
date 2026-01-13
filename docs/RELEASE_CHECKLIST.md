# リリース前チェックリスト

**作成日**: 2026-01-13  
**プロジェクト**: MMQ Yoyaq（マーダーミステリー店舗管理システム）

---

## 🔴 クリティカル（リリース前に必須）

### セキュリティ

| # | 項目 | 状態 | 確認方法 |
|---|------|------|----------|
| 1 | ✅ セキュリティヘッダー設定 | 完了 | `vercel.json` で HSTS, X-Frame-Options 等設定済み |
| 2 | ✅ Edge Functions CORS制限 | 完了 | 全20ファイルで `getCorsHeaders()` 使用 |
| 3 | ✅ Edge Functions 認証 | 完了 | `delete-user`, `invite-staff`, `send-email` に認証必須 |
| 4 | ✅ RLS (Row Level Security) | 完了 | 全27テーブルで有効 |
| 5 | ✅ ログマスキング | 完了 | `maskEmail()`, `maskName()`, `maskPhone()` 実装済み |
| 6 | ⬜ Supabaseハードコード確認 | **要確認** | `src/lib/supabase.ts` - フォールバック削除済みか確認 |

### 環境変数

| # | 項目 | 確認場所 | 備考 |
|---|------|----------|------|
| 1 | ⬜ Vercel環境変数 | Vercel Dashboard | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| 2 | ⬜ Supabase Secrets | Supabase Dashboard → Edge Functions | `RESEND_API_KEY` |
| 3 | ⬜ Discord Bot Token | Supabase Secrets | `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY` |
| 4 | ⬜ Google Sheets API | Supabase Secrets | `GOOGLE_SHEETS_*` |
| 5 | ⬜ Supabase Auth SMTP | Supabase → Auth → SMTP | Resend設定（パスワードリセットメール用） |

### ビルド確認

| # | 項目 | 状態 | コマンド |
|---|------|------|----------|
| 1 | ✅ TypeScript型チェック | 完了 | `npm run typecheck` - エラーなし |
| 2 | ✅ ビルド成功 | 完了 | `npm run build` - 成功 |
| 3 | ⬜ 本番ビルドサイズ確認 | 要確認 | 最大チャンク 282KB（妥当な範囲） |

---

## 🟡 重要（リリース前推奨）

### 法的・コンプライアンス

| # | 項目 | 状態 | ファイル |
|---|------|------|----------|
| 1 | ✅ 利用規約ページ | 存在 | `src/pages/static/TermsPage.tsx` → `/terms` |
| 2 | ✅ プライバシーポリシー | 存在 | `src/pages/static/PrivacyPage.tsx` → `/privacy` |
| 3 | ⬜ 利用規約の内容確認 | 要確認 | 法的に問題ないか確認（弁護士チェック推奨） |
| 4 | ⬜ プライバシーポリシー内容確認 | 要確認 | 収集データ・利用目的が正確か |
| 5 | ⬜ 最終更新日 | 要更新 | 現在「2024年1月1日」→「2026年1月」に更新 |
| 6 | ⬜ 特定商取引法表記 | 要確認 | 決済機能がある場合は必須 |

### 機能確認（手動テスト）

| # | 項目 | テスト内容 |
|---|------|----------|
| 1 | ⬜ 新規登録フロー | 組織登録 → 管理者作成 → メール確認 |
| 2 | ⬜ ログイン/ログアウト | メール+パスワード、マジックリンク |
| 3 | ⬜ パスワードリセット | リセットメール送信 → 新パスワード設定 |
| 4 | ⬜ 予約フロー | 顧客予約 → 確認メール → 管理画面反映 |
| 5 | ⬜ 管理画面基本機能 | スケジュール表示、予約管理、スタッフ管理 |
| 6 | ⬜ メール送信 | 予約確認、リマインダー、キャンセル確認 |
| 7 | ⬜ Discord連携 | 通知が正しく送信されるか |
| 8 | ⬜ モバイル表示 | レスポンシブデザイン確認 |

### E2Eテスト

| # | 項目 | 状態 | コマンド |
|---|------|------|----------|
| 1 | ⬜ 予約フローテスト | 存在 | `e2e/booking-flow.spec.ts` |
| 2 | ⬜ E2Eテスト実行 | 要実行 | `npm run test:e2e` |

---

## 🟢 推奨（リリース後でも可）

### コード品質

| # | 項目 | 現状 | 対応 |
|---|------|------|------|
| 1 | ⬜ console.log削除 | 92箇所 | `logger` ユーティリティに置換 |
| 2 | ⬜ `as any` 削減 | 53箇所 | 適切な型定義に置換 |
| 3 | ⬜ setTimeout cleanup | 34箇所 | `clearTimeout` 追加 |
| 4 | ⬜ TODO対応 | 17箇所 | Issue化して対応 |

### パフォーマンス

| # | 項目 | 備考 |
|---|------|------|
| 1 | ⬜ N+1クエリ修正 | `api.ts` の `scheduleApi.getByMonth()` |
| 2 | ⬜ 画像最適化 | 重い画像がないか確認 |
| 3 | ⬜ Lighthouse確認 | パフォーマンススコア確認 |

### 運用準備

| # | 項目 | 備考 |
|---|------|------|
| 1 | ⬜ エラー監視設定 | Sentry等の導入検討 |
| 2 | ⬜ アクセス解析 | Google Analytics等 |
| 3 | ⬜ バックアップ確認 | Supabaseの自動バックアップ設定 |
| 4 | ⬜ カスタムドメイン | 必要に応じてVercelで設定 |
| 5 | ⬜ SSL証明書 | Vercelで自動設定（確認のみ） |

---

## 📋 リリース当日チェックリスト

### デプロイ前

```bash
# 1. 最新コードをプル
git pull origin main

# 2. 依存関係更新
npm ci

# 3. 型チェック
npm run typecheck

# 4. ビルド確認
npm run build

# 5. E2Eテスト（可能であれば）
npm run test:e2e
```

### デプロイ後

| # | 項目 | 確認方法 |
|---|------|----------|
| 1 | ⬜ サイトアクセス確認 | 本番URLにアクセス |
| 2 | ⬜ HTTPS確認 | ブラウザで鍵マーク確認 |
| 3 | ⬜ ログイン確認 | テストアカウントでログイン |
| 4 | ⬜ 主要機能確認 | 予約、管理画面等 |
| 5 | ⬜ メール送信確認 | テスト予約でメール受信確認 |
| 6 | ⬜ エラーログ確認 | Vercel/Supabaseのログ確認 |

---

## 🔧 環境変数一覧

### Vercel（フロントエンド）

```env
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_APP_ENV=production
```

### Supabase Edge Functions Secrets

```bash
# 必須
RESEND_API_KEY=re_xxxxxxxx

# Discord連携（使用する場合）
DISCORD_BOT_TOKEN=xxxxxxxx
DISCORD_PUBLIC_KEY=xxxxxxxx

# Google Sheets連携（使用する場合）
GOOGLE_SHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
GOOGLE_SHEETS_CLIENT_EMAIL=xxxxxxxx@xxx.iam.gserviceaccount.com
GOOGLE_SHEETS_SPREADSHEET_ID=xxxxxxxx
```

### Supabase Auth SMTP設定

```
Host: smtp.resend.com
Port: 587
Username: resend
Password: [RESEND_API_KEY と同じ値]
Sender: noreply@mmq.game
```

---

## ⚠️ 既知の問題（リリース後対応）

| 問題 | 優先度 | 詳細 |
|------|--------|------|
| console.log残存 | 中 | 92箇所 - ログが本番で出力される |
| as any使用 | 中 | 53箇所 - 型安全性の問題 |
| setTimeout未クリーンアップ | 低 | 34箇所 - メモリリーク可能性 |

詳細は `docs/PROJECT_ISSUES_REPORT.md` を参照

---

## 📞 緊急連絡先

- **技術担当**: [要記入]
- **Supabaseダッシュボード**: https://supabase.com/dashboard
- **Vercelダッシュボード**: https://vercel.com/dashboard

---

*最終更新: 2026-01-13*

