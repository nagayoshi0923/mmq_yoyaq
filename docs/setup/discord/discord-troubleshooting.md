# Discord通知が届かない問題のトラブルシューティング

## 問題
貸切確認のDiscord通知が届かなくなった

## チェックリスト

### 1. Edge Functionが正しくデプロイされているか確認

Supabase Dashboard → Edge Functions → `notify-private-booking-discord` を確認:
- ✅ 関数が存在するか
- ✅ 最新版がデプロイされているか
- ✅ ログにエラーが出ていないか

### 2. 環境変数（Secrets）の確認

```bash
# Supabase Dashboard → Project Settings → Edge Functions → Manage secrets
```

必要な環境変数:
- `DISCORD_BOT_TOKEN` - Discordボットのトークン
- `SUPABASE_URL` - プロジェクトURL（自動設定）
- `SUPABASE_SERVICE_ROLE_KEY` - サービスロールキー（自動設定）

### 3. Database Webhook/Triggerの確認

#### 方法A: Supabase Dashboard → Database → Webhooks

以下のWebhookが存在するか確認:
- Name: `notify_private_booking_discord`
- Table: `reservations`
- Events: `INSERT`
- URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking-discord`
- Condition: `reservation_source = 'web_private'`

#### 方法B: Database → SQL Editor で確認

```sql
-- トリガーが存在するか確認
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  proname AS function_name
FROM pg_trigger
JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
WHERE tgname LIKE '%private%booking%';

-- pg_net拡張が有効か確認
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

### 4. スタッフテーブルに `discord_channel_id` が設定されているか

```sql
-- GMスタッフのdiscord_channel_id を確認
SELECT 
  id,
  name,
  role,
  discord_channel_id,
  discord_id,
  status
FROM staff
WHERE 'gm' = ANY(role)
  AND status = 'active';
```

**重要**: `discord_channel_id` が NULL の場合、通知は送信されません。

### 5. Discord Bot の権限確認

Discord Developer Portal → Applications → Your Bot → Bot で確認:
- ✅ `MESSAGE CONTENT INTENT` が有効か
- ✅ `Send Messages` 権限があるか
- ✅ `Embed Links` 権限があるか
- ✅ `Use Application Commands` 権限があるか

### 6. テスト用SQLでリクエストを作成

```sql
-- テスト用の貸切リクエストを作成
INSERT INTO reservations (
  title,
  reservation_number,
  scenario_id,
  customer_name,
  customer_email,
  customer_phone,
  participant_count,
  base_price,
  total_price,
  final_price,
  status,
  reservation_source,
  candidate_datetimes,
  created_at
) VALUES (
  '【貸切希望】テストシナリオ',
  'TEST-001',
  (SELECT id FROM scenarios LIMIT 1),
  'テスト太郎',
  'test@example.com',
  '090-1234-5678',
  8,
  20000,
  20000,
  20000,
  'pending',
  'web_private',
  '{"candidates": [{"order": 1, "date": "2025-10-20", "timeSlot": "夜", "startTime": "18:00", "endTime": "21:00"}]}'::jsonb,
  NOW()
);
```

### 7. Edge Functionを直接テスト

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking-discord" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "insert",
    "table": "reservations",
    "record": {
      "id": "test-123",
      "customer_name": "テスト太郎",
      "scenario_title": "テストシナリオ",
      "participant_count": 8,
      "candidate_datetimes": {
        "candidates": [{
          "order": 1,
          "date": "2025-10-20",
          "timeSlot": "夜",
          "startTime": "18:00",
          "endTime": "21:00"
        }]
      }
    }
  }'
```

## よくある原因と解決方法

### 原因1: Database Webhook/Triggerが設定されていない
**解決**: `DISCORD_NOTIFICATION_QUICK_SETUP.md` の手順6を実行

### 原因2: スタッフに `discord_channel_id` が設定されていない
**解決**: 
```sql
-- GMスタッフにDiscordチャンネルIDを設定
UPDATE staff 
SET discord_channel_id = 'YOUR_CHANNEL_ID'
WHERE id = 'STAFF_ID';
```

チャンネルIDの取得方法:
1. Discordで開発者モードを有効化（設定 → 詳細設定 → 開発者モード）
2. チャンネルを右クリック → 「IDをコピー」

### 原因3: Discord Bot Tokenが無効または期限切れ
**解決**: 新しいトークンを生成して環境変数を更新
```bash
supabase secrets set DISCORD_BOT_TOKEN="YOUR_NEW_BOT_TOKEN"
supabase functions deploy notify-private-booking-discord
```

### 原因4: Edge Functionが古いバージョン
**解決**: 再デプロイ
```bash
supabase functions deploy notify-private-booking-discord
```

## 最も可能性が高い原因

**Database Webhook/Triggerが設定されていない**

貸切リクエストは正しく作成されていますが、Edge Functionが呼ばれていない可能性が高いです。

👉 **今すぐ確認**: Supabase Dashboard → Database → Webhooks で `notify_private_booking_discord` が存在するか確認してください。

存在しない場合は、`DISCORD_NOTIFICATION_QUICK_SETUP.md` の手順6に従って設定してください。

