# Discord シフト通知セットアップガイド

## 📋 概要

Discordを使ってスタッフにシフト募集を通知し、提出状況を自動管理するシステムです。

---

## 🎯 機能

### 1. シフト募集通知（月初）
毎月25日に翌月のシフト募集通知を自動送信
```
【2025年2月シフト募集】

📅 2/1(土) [朝] [昼] [夜] [終日]
📅 2/2(日) [朝] [昼] [夜] [終日]
... (1ヶ月分)

⏰ 締切: 前月25日 23:59まで
💡 提出方法: 下記ボタンからシフト提出ページへ
```

### 2. シフト提出完了通知
スタッフがシフトを提出すると自動通知
```
✅ 田中GMがシフトを提出しました

📅 対象月: 2025年2月
📊 出勤可能日数: 18日

🌟 終日: 5日
🌅 朝(10-14時): 10日
☀️ 昼(14-18時): 15日
🌙 夜(18-22時): 12日
```

### 3. 未提出者リマインダー（締切3日前）
締切3日前に未提出者へ自動リマインダー
```
⚠️ シフト提出リマインダー

@田中GM @佐藤GM

📅 対象月: 2025年2月
⏰ 締切: 2025-01-25 23:59
⏳ 残り: 3日

まだシフトを提出していません。
締切までに提出をお願いします。
```

---

## 🔧 セットアップ手順

### Step 1: データベース設定

```bash
# Supabaseダッシュボードで実行
psql -h <your-db-host> -d postgres -f database/create_shift_notifications.sql
```

### Step 2: Discord設定

#### 2-1. チャンネルIDを取得
1. Discordで開発者モードを有効化
2. シフト通知用チャンネルを右クリック
3. 「IDをコピー」

#### 2-2. データベースに設定を保存
```sql
-- notification_settings テーブルに設定を追加
INSERT INTO notification_settings (
  discord_shift_channel_id,
  shift_notification_enabled,
  shift_reminder_days
) VALUES (
  '1234567890123456789', -- チャンネルID
  true,                  -- 通知有効
  3                      -- リマインダー日数
)
ON CONFLICT (id) DO UPDATE SET
  discord_shift_channel_id = EXCLUDED.discord_shift_channel_id,
  shift_notification_enabled = EXCLUDED.shift_notification_enabled,
  shift_reminder_days = EXCLUDED.shift_reminder_days;
```

### Step 3: スタッフにDiscordユーザーIDを設定（オプション）

```sql
-- staffテーブルにdiscord_user_idを追加（メンション用）
ALTER TABLE staff ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- スタッフごとに設定
UPDATE staff
SET discord_user_id = '9876543210987654321'
WHERE name = '田中GM';
```

### Step 4: Edge Functionのデプロイ

```bash
# Supabase CLIでデプロイ
supabase functions deploy notify-shift-request-discord
supabase functions deploy notify-shift-submitted-discord
supabase functions deploy notify-shift-reminder-discord
```

---

## 📞 使い方

### 手動でシフト募集通知を送信

```bash
# Supabase ダッシュボード > Edge Functions > invoke

# 関数: notify-shift-request-discord
# ペイロード:
{
  "year": 2025,
  "month": 2,
  "deadline": "2025-01-25 23:59"
}
```

### 手動でリマインダーを送信

```bash
# 関数: notify-shift-reminder-discord
# ペイロード:
{
  "year": 2025,
  "month": 2,
  "deadline": "2025-01-25 23:59"
}
```

### 自動化（Cron Job）

Supabaseの`pg_cron`を使って自動化：

```sql
-- 毎月25日 9:00に翌月のシフト募集を送信
SELECT cron.schedule(
  'shift-request-notification',
  '0 9 25 * *',
  $$
  SELECT net.http_post(
    url := 'https://<your-project>.supabase.co/functions/v1/notify-shift-request-discord',
    headers := '{"Authorization": "Bearer <YOUR_ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'year', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 month')),
      'month', EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 month')),
      'deadline', (CURRENT_DATE + INTERVAL '25 days')::text || ' 23:59'
    )
  ) AS request_id;
  $$
);

-- 毎月22日 9:00にリマインダーを送信（締切3日前）
SELECT cron.schedule(
  'shift-reminder-notification',
  '0 9 22 * *',
  $$
  SELECT net.http_post(
    url := 'https://<your-project>.supabase.co/functions/v1/notify-shift-reminder-discord',
    headers := '{"Authorization": "Bearer <YOUR_ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'year', EXTRACT(YEAR FROM (CURRENT_DATE + INTERVAL '1 month')),
      'month', EXTRACT(MONTH FROM (CURRENT_DATE + INTERVAL '1 month')),
      'deadline', (CURRENT_DATE + INTERVAL '3 days')::text || ' 23:59'
    )
  ) AS request_id;
  $$
);
```

---

## 🧪 テスト

### 1. シフト募集通知のテスト
```bash
curl -X POST \
  https://<your-project>.supabase.co/functions/v1/notify-shift-request-discord \
  -H "Authorization: Bearer <YOUR_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "year": 2025,
    "month": 2
  }'
```

### 2. 提出完了通知のテスト
管理画面でシフトを提出すると自動的に送信されます

### 3. リマインダーのテスト
```bash
curl -X POST \
  https://<your-project>.supabase.co/functions/v1/notify-shift-reminder-discord \
  -H "Authorization: Bearer <YOUR_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "year": 2025,
    "month": 2,
    "deadline": "2025-01-25 23:59"
  }'
```

---

## 📝 カスタマイズ

### 通知メッセージの編集
各Edge Function内のメッセージ生成部分を編集：
- `supabase/functions/notify-shift-request-discord/index.ts` - 募集通知
- `supabase/functions/notify-shift-submitted-discord/index.ts` - 提出完了通知
- `supabase/functions/notify-shift-reminder-discord/index.ts` - リマインダー

### 締切日の変更
デフォルトは「前月25日」ですが、変更可能：
```typescript
// notify-shift-request-discord/index.ts 内
const deadlineDate = deadline || `${prevYear}-${prevMonth}-20 23:59` // 20日に変更
```

---

## ❓ トラブルシューティング

### 通知が送信されない
1. Discord Bot Tokenが正しく設定されているか確認
2. チャンネルIDが正しいか確認
3. Botがチャンネルにアクセスできるか確認
4. Edge Functionのログを確認

### メンションが機能しない
1. `staff.discord_user_id`が正しく設定されているか確認
2. Discord User IDの形式（数値のみ）を確認
3. BotがユーザーIDを取得できる権限があるか確認

### リマインダーが未提出者を検出しない
1. `staff_shifts.status = 'submitted'`が正しく保存されているか確認
2. `staff.is_active = true`のスタッフのみが対象
3. データベースのタイムゾーン設定を確認

---

## 📚 関連ファイル

- Edge Functions:
  - `supabase/functions/notify-shift-request-discord/index.ts`
  - `supabase/functions/notify-shift-submitted-discord/index.ts`
  - `supabase/functions/notify-shift-reminder-discord/index.ts`

- Database:
  - `database/create_shift_notifications.sql`

- Frontend:
  - `src/pages/ShiftSubmission/hooks/useShiftSubmit.ts`

---

## 🎉 完了！

これでDiscord経由でシフト管理が自動化されます。

