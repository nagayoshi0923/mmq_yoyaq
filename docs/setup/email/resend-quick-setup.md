# Resend クイックセットアップ（mmq.game ドメイン）

## 🎯 目標

パスワードリセットメールが送信できるようにする

---

## ⚡ クイックスタート（5分）

### ステップ1: Supabase Auth SMTP設定

https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth

下にスクロールして「**SMTP Settings**」:

```
Enable Custom SMTP: ON ✅

Sender name: MMQ
Sender email: noreply@mmq.game

Host: smtp.resend.com
Port: 587
Admin email: mai.nagayoshi@gmail.com

SMTP Username: resend
SMTP Password: [Your RESEND_API_KEY]
```

**重要**: SMTP Password は `RESEND_API_KEY` と同じ値です！

### ステップ2: Save をクリック

「**Save**」ボタンをクリック

---

## ✅ テスト

1. アプリのログイン画面を開く
2. 「**パスワードを忘れた場合**」をクリック
3. メールアドレスを入力
4. 「**リセットメールを送信**」をクリック
5. メールが届くことを確認 ✅

---

## ❌ メールが届かない場合

### 確認1: 迷惑メールフォルダ

Gmail、Outlookなどの迷惑メールフォルダをチェック

### 確認2: Resendのログ

https://resend.com/emails

最近の送信履歴とエラーを確認

### 確認3: Supabaseのログ

https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/logs

Auth関連のエラーを確認

### 確認4: SMTP設定を再確認

- **Username**: `resend`（固定）
- **Password**: `RESEND_API_KEY` の値（`re_` で始まる）
- **Sender email**: `noreply@mmq.game`

### 確認5: ドメイン認証

Resend Dashboard → Domains → `mmq.game`

ステータスが「**Verified**」になっているか確認

---

## 📋 現在の設定状況

| 項目 | ステータス |
|-----|----------|
| Resend アカウント | ✅ 作成済み |
| RESEND_API_KEY | ✅ 設定済み（Edge Functions用） |
| mmq.game ドメイン認証 | ✅ 完了 |
| スタッフ招待メール | ✅ 動作中 (`noreply@mmq.game`) |
| 予約確認メール | ⚠️ `booking@mmq.example.com` を使用中 |
| パスワードリセット | ⚠️ Supabase Auth SMTP設定が必要 |

---

## 🔧 メールアドレスの統一（推奨）

現在、異なるメールアドレスが混在しています。統一を推奨します：

### 変更が必要なファイル:

1. `supabase/functions/send-booking-confirmation/index.ts` (187行目)
2. `supabase/functions/send-reminder-emails/index.ts` (91行目)

変更内容:
```typescript
// 変更前
from: 'MMQ予約システム <booking@mmq.example.com>',

// 変更後
from: 'MMQ予約システム <noreply@mmq.game>',
```

変更後、再デプロイ:
```bash
./deploy-functions.sh
```

---

## 📚 詳細ドキュメント

詳しい手順は以下を参照：

- **EMAIL_SETUP.md** - 完全なセットアップガイド
- **RESEND_PASSWORD_RESET_SETUP.md** - パスワードリセット詳細ガイド

---

## 🆘 サポート

問題が解決しない場合は、開発チームに以下の情報を提供してください：

1. Resend Dashboard のスクリーンショット（Emails ログ）
2. Supabase Dashboard のログ（Auth関連）
3. ブラウザのコンソールエラー
4. 試したメールアドレス


