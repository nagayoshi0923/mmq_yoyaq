# リマインダーメール自動送信 Cron Jobs セットアップガイド

## 📋 概要

このガイドでは、予約の3日前に自動的にリマインダーメールを送信するCron Jobsの設定方法を説明します。

---

## 🔧 実装内容

### 1. Edge Function: `auto-send-reminder-emails`

**ファイル**: `supabase/functions/auto-send-reminder-emails/index.ts`

**機能**:
- 毎日自動実行され、3日後の予約を検索
- 該当する予約者全員にリマインダーメールを送信
- 送信結果をログに記録

**処理フロー**:
1. 現在日時から3日後の日付を計算
2. その日付の公演を`schedule_events`テーブルから取得
3. 各公演の予約を`reservations`テーブルから取得（status: confirmed/pending）
4. 各予約者に`send-reminder-emails`関数を呼び出してメール送信
5. 送信成功数とエラー数を記録

---

## ⚙️ Cron Jobs 設定

### Supabase Dashboard での設定

#### 手順 1: Edge Functions にアクセス

1. Supabase Dashboard を開く
2. プロジェクトを選択
3. 左メニューから **「Edge Functions」** をクリック

#### 手順 2: Cron Jobs を作成

1. **「Cron」** タブをクリック
2. **「New Cron Job」** をクリック
3. 以下の情報を入力:
   - **Name**: `auto-send-reminder-emails`
   - **Function**: `auto-send-reminder-emails`
   - **Schedule**: `0 9 * * *` (毎日 9:00 AM UTC = 日本時間 18:00)
   - **Enabled**: ON

#### 手順 3: 環境変数の確認

以下の環境変数が設定されていることを確認してください:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

---

## 📅 Cron スケジュール設定

### 基本的な Cron 式

```
分 時 日 月 曜日
```

### よく使う設定例

| スケジュール | Cron式 | 説明 |
|------------|--------|------|
| 毎日 9:00 AM (UTC) | `0 9 * * *` | 日本時間 18:00 |
| 毎日 0:00 AM (UTC) | `0 0 * * *` | 日本時間 9:00 |
| 毎日 6:00 AM (UTC) | `0 6 * * *` | 日本時間 15:00 |
| 6時間ごと | `0 */6 * * *` | 0時、6時、12時、18時 |
| 平日 9:00 AM (UTC) | `0 9 * * 1-5` | 月〜金の 9:00 |

**注意**: Supabase は UTC で動作します。日本時間（JST）は UTC+9 なので、JST 18:00 = UTC 9:00 です。

---

## 🚀 デプロイ

### 1. Edge Function をデプロイ

```bash
# 自動リマインダーメール送信関数をデプロイ
supabase functions deploy auto-send-reminder-emails
```

### 2. Cron Job を有効化

Supabase Dashboard で Cron Job を有効化してください（上記の手順 2 を参照）。

---

## 🧪 テスト

### 手動でテスト実行

```bash
# ローカルで実行
supabase functions serve auto-send-reminder-emails

# 別のターミナルでリクエスト送信
curl -i --location --request POST 'http://localhost:54321/functions/v1/auto-send-reminder-emails' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

### 本番環境でテスト実行

Supabase Dashboard で:
1. **Edge Functions** → `auto-send-reminder-emails` を選択
2. **「Invoke」** ボタンをクリック
3. ログで実行結果を確認

---

## 📊 ログ確認

### Supabase Dashboard でログを確認

1. **Edge Functions** → `auto-send-reminder-emails` を選択
2. **「Logs」** タブをクリック
3. 実行履歴とエラーを確認

### ログの内容

- 対象日
- 対象公演数
- 送信成功数
- エラー数

---

## 🔄 カスタマイズ

### リマインダー送信タイミングを変更

`auto-send-reminder-emails/index.ts` の以下の行を変更:

```typescript
// 3日前 → 1日前に変更
const reminderDaysBefore = 1
```

### 複数のタイミングで送信

複数の Cron Jobs を作成:
- `auto-send-reminder-emails-3days`: 3日前
- `auto-send-reminder-emails-1day`: 1日前
- `auto-send-reminder-emails-morning`: 当日朝

---

## ⚠️ 注意事項

### 1. Rate Limit

Resend の Rate Limit に注意してください:
- 無料プラン: 100通/日
- プロプラン: 詳細は Resend Dashboard で確認

大量の予約がある場合は、バッチ処理やレート制限を実装してください。

### 2. 重複送信の防止

現在の実装では、毎回送信します。重複を防ぐには:
- `reservations` テーブルに `reminder_sent_at` カラムを追加
- 送信済みの予約をスキップ

### 3. エラー処理

メール送信エラーが発生しても処理は継続されます。エラーはログに記録されますが、リトライ機構はありません。

---

## 🛠️ トラブルシューティング

### Cron Job が実行されない

1. **Cron Job が有効になっているか確認**
   - Supabase Dashboard → Edge Functions → Cron で確認

2. **Edge Function がデプロイされているか確認**
   ```bash
   supabase functions list
   ```

3. **環境変数が設定されているか確認**
   - Supabase Dashboard → Settings → Edge Functions → Environment Variables

### メールが送信されない

1. **Resend API Key が正しいか確認**
   - Resend Dashboard でキーを確認

2. **3日後に予約があるか確認**
   - データベースで `schedule_events` と `reservations` を確認

3. **ログでエラーを確認**
   - Supabase Dashboard → Edge Functions → Logs

### タイムゾーンの問題

Supabase は UTC で動作します。日本時間で考える場合は、9時間を引いてください。

例:
- JST 18:00 に送信したい → UTC 9:00 → Cron式: `0 9 * * *`

---

## 📚 関連ドキュメント

- `EMAIL_USAGE_SCENARIOS.md` - メール使用シーン一覧
- `EMAIL_SETUP.md` - メール送信機能セットアップ
- `supabase/functions/send-reminder-emails/index.ts` - リマインダーメール送信関数
- `supabase/functions/auto-send-reminder-emails/index.ts` - 自動送信関数

---

## 📝 設定完了チェックリスト

- [ ] `auto-send-reminder-emails` Edge Function をデプロイ
- [ ] Supabase Dashboard で Cron Job を作成
- [ ] Cron Job のスケジュールを設定（例: `0 9 * * *`）
- [ ] Cron Job を有効化
- [ ] 環境変数を確認（SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY）
- [ ] テスト実行で動作確認
- [ ] ログで送信結果を確認

---

## 🎯 次のステップ

1. **送信履歴の管理**
   - `reminder_sent_at` カラムを追加して重複送信を防止

2. **カスタマイズ可能な送信タイミング**
   - 管理画面でリマインダー送信日を設定可能に

3. **複数回のリマインダー**
   - 3日前、1日前、当日朝など複数回送信

4. **A/Bテスト**
   - メールテンプレートの効果測定

---

最終更新: 2025-11-02

