# メール関連 Edge Functions デプロイガイド

## 📋 概要

このガイドでは、新規作成・更新したメール関連 Edge Functions のデプロイ手順を説明します。

---

## 🎯 デプロイ対象

### 新規作成した Functions

1. **send-cancellation-confirmation** - 予約キャンセル確認メール
2. **send-private-booking-confirmation** - 貸切予約確定メール
3. **send-private-booking-rejection** - 貸切リクエスト却下メール
4. **send-booking-change-confirmation** - 予約変更確認メール
5. **auto-send-reminder-emails** - リマインダーメール自動送信（Cron用）

### 更新した Functions

1. **send-email** - 一斉メール送信（Resend APIに移行、メールアドレス統一）
2. **send-booking-confirmation** - 予約確認メール（メールアドレス統一）
3. **send-reminder-emails** - リマインダーメール（メールアドレス統一）

---

## 🚀 一括デプロイ（推奨）

### 方法 1: デプロイスクリプトを使用

```bash
./deploy-email-functions.sh
```

このスクリプトは以下を自動実行します:
- 全8つのメール関連 Edge Functions を順番にデプロイ
- 成功/失敗の結果を表示
- 次のステップを案内

### 方法 2: 個別デプロイ

特定の Function のみをデプロイする場合:

```bash
# 予約キャンセル確認メール
supabase functions deploy send-cancellation-confirmation --no-verify-jwt

# 貸切予約確定メール
supabase functions deploy send-private-booking-confirmation --no-verify-jwt

# 貸切リクエスト却下メール
supabase functions deploy send-private-booking-rejection --no-verify-jwt

# 予約変更確認メール
supabase functions deploy send-booking-change-confirmation --no-verify-jwt

# リマインダーメール自動送信
supabase functions deploy auto-send-reminder-emails --no-verify-jwt

# 一斉メール送信（更新）
supabase functions deploy send-email --no-verify-jwt

# 予約確認メール（更新）
supabase functions deploy send-booking-confirmation --no-verify-jwt

# リマインダーメール（更新）
supabase functions deploy send-reminder-emails --no-verify-jwt
```

---

## ⚙️ 環境変数の確認

デプロイ前に、以下の環境変数が Supabase Dashboard に設定されているか確認してください。

### 必須の環境変数

| 変数名 | 説明 | 取得方法 |
|-------|------|---------|
| `RESEND_API_KEY` | Resend API キー | Resend Dashboard → API Keys |
| `SUPABASE_URL` | Supabase プロジェクト URL | 自動設定済み |
| `SUPABASE_ANON_KEY` | Supabase 匿名キー | 自動設定済み |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー | 自動設定済み（Cron用） |

### 環境変数の設定方法

1. Supabase Dashboard を開く
2. **Settings** → **Edge Functions** → **Environment Variables** をクリック
3. `RESEND_API_KEY` を追加:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Resend Dashboard から取得した API Key
   - **Save** をクリック

---

## 🕐 Cron Jobs の設定（リマインダー自動送信）

`auto-send-reminder-emails` Function のデプロイ後、Cron Jobs を設定します。

### 手順

1. Supabase Dashboard を開く
2. **Edge Functions** → **Cron** をクリック
3. **New Cron Job** をクリック
4. 以下の情報を入力:
   - **Name**: `auto-send-reminder-emails`
   - **Function**: `auto-send-reminder-emails`
   - **Schedule**: `0 9 * * *` （毎日 9:00 AM UTC = 日本時間 18:00）
   - **Enabled**: ON
5. **Create** をクリック

### スケジュール例

| 実行タイミング | Cron 式 | 日本時間 |
|-------------|---------|---------|
| 毎日 9:00 AM UTC | `0 9 * * *` | 18:00 |
| 毎日 0:00 AM UTC | `0 0 * * *` | 09:00 |
| 毎日 6:00 AM UTC | `0 6 * * *` | 15:00 |

詳細は `REMINDER_EMAIL_CRON_SETUP.md` を参照してください。

---

## 🧪 デプロイ後のテスト

### 1. 予約キャンセル確認メール

管理画面でテスト予約を作成し、キャンセルして確認:
```
1. スケジュール管理で公演を中止
2. 予約者にメールが届くか確認
```

### 2. 貸切予約確定メール

貸切リクエスト管理で承認してテスト:
```
1. 貸切リクエストを作成
2. 承認処理を実行
3. 顧客にメールが届くか確認
```

### 3. 貸切リクエスト却下メール

貸切リクエスト管理で却下してテスト:
```
1. 貸切リクエストを作成
2. 却下処理を実行
3. 顧客にメールが届くか確認
```

### 4. 予約変更確認メール

予約情報を変更してテスト:
```javascript
// reservationApi.update の第3引数に true を指定
await reservationApi.update(reservationId, {
  participant_count: 5,
  total_price: 15000
}, true) // sendEmail=true
```

### 5. リマインダーメール自動送信

Supabase Dashboard で手動実行してテスト:
```
1. Edge Functions → auto-send-reminder-emails → Invoke
2. Logs で実行結果を確認
3. 3日後の予約がある場合、メールが送信されるか確認
```

### 6. 一斉メール送信

スケジュール詳細画面でテスト:
```
1. 公演を選択
2. 予約者にチェック
3. メール送信ボタンをクリック
4. 件名・本文を入力して送信
```

---

## 📊 ログ確認

デプロイ後、各 Function が正しく動作しているか確認します。

### Supabase Dashboard でログを確認

1. **Edge Functions** をクリック
2. 確認したい Function を選択
3. **Logs** タブをクリック

### ログの内容

- 成功ログ: `Email sent successfully`
- エラーログ: `Resend API error`, `メール送信に失敗しました`

### Resend Dashboard でメール送信履歴を確認

1. https://resend.com/emails にアクセス
2. 送信履歴を確認
3. ステータスが `Delivered` になっているか確認

---

## ⚠️ トラブルシューティング

### デプロイエラー: `Function not found`

```bash
# Supabase CLI が最新か確認
supabase --version

# 最新版にアップデート
brew upgrade supabase
```

### デプロイエラー: `Invalid credentials`

```bash
# Supabase にログイン
supabase login

# プロジェクトにリンク
supabase link --project-ref <YOUR_PROJECT_ID>
```

### メールが送信されない: `RESEND_API_KEY is not set`

環境変数が設定されていません。上記の「環境変数の確認」を参照してください。

### メールが送信されない: `Rate limit exceeded`

Resend の Rate Limit に達しています。Resend Dashboard でプランを確認してください。

### Cron Job が実行されない

1. Cron Job が有効になっているか確認
2. Supabase Dashboard → Edge Functions → Cron で確認
3. スケジュールが正しいか確認（UTC タイムゾーン）

---

## 📚 関連ドキュメント

- **EMAIL_SETUP.md** - メール送信機能セットアップガイド
- **EMAIL_USAGE_SCENARIOS.md** - メール使用シーン一覧
- **REMINDER_EMAIL_CRON_SETUP.md** - リマインダーメール Cron 設定
- **RESEND_QUICK_SETUP.md** - Resend クイックセットアップ

---

## ✅ デプロイ完了チェックリスト

- [ ] 全8つの Edge Functions をデプロイ
- [ ] 環境変数 `RESEND_API_KEY` を設定
- [ ] Cron Jobs を設定（`auto-send-reminder-emails`）
- [ ] 予約キャンセル確認メールをテスト
- [ ] 貸切予約確定メールをテスト
- [ ] 貸切リクエスト却下メールをテスト
- [ ] 予約変更確認メールをテスト
- [ ] リマインダーメール自動送信をテスト
- [ ] 一斉メール送信をテスト
- [ ] Supabase Dashboard でログを確認
- [ ] Resend Dashboard でメール送信履歴を確認

---

## 🎉 完了！

全てのメール関連 Edge Functions のデプロイが完了しました！

本番環境で実際の予約・キャンセル・変更などを行い、メールが正しく送信されることを確認してください。

---

最終更新: 2025-11-02

