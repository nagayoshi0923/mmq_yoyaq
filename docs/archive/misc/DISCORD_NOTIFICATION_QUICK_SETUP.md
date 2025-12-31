# Discord通知 クイックセットアップ

貸切予約が申し込まれたときに、Discordチャンネルに通知を送る機能のセットアップ手順です。

## 1. Discord Webhook URLを取得

1. Discordで通知を受け取りたいチャンネルを開く
2. チャンネル設定（歯車アイコン）をクリック
3. 「連携サービス」→「ウェブフック」
4. 「新しいウェブフック」をクリック
5. 名前を設定（例: 「貸切予約Bot」）
6. アバター画像を設定（オプション）
7. 「ウェブフックURLをコピー」をクリック

## 2. Supabase CLIのインストール

### macOS
```bash
brew install supabase/tap/supabase
```

### Windows
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### npm経由（全プラットフォーム）
```bash
npm install -g supabase
```

## 3. Supabaseにログイン & プロジェクトをリンク

```bash
# Supabaseにログイン
supabase login

# プロジェクトディレクトリに移動
cd /Users/nagayoshimai/mmq_yoyaq

# プロジェクトをリンク（プロジェクトREFはSupabaseダッシュボードのURLから取得）
supabase link --project-ref YOUR_PROJECT_REF
```

**プロジェクトREFの確認方法**:
SupabaseダッシュボードのURL: `https://supabase.com/dashboard/project/【YOUR_PROJECT_REF】`

## 4. 環境変数を設定

```bash
# Discord Webhook URLを設定
supabase secrets set https://discord.com/api/webhooks/1427058594414727299/FUtHxYXinJ0dfEWMqoCiChXVdaQgSJBKK1-pfyBbwEBwftNjKvtlcC-tsJ1KpMAeOM_o"

# （オプション）サイトURLを設定
supabase secrets set SITE_URL="https://your-domain.com"

# （オプション）LINE通知も設定する場合
supabase secrets set LINE_NOTIFY_TOKEN="YOUR_LINE_NOTIFY_TOKEN"
```

**設定を確認**:
```bash
supabase secrets list
```

## 5. Edge Functionをデプロイ

```bash
supabase functions deploy notify-private-booking
```

デプロイが成功すると、Function URLが表示されます：
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking
```

## 6. Database Webhookを設定

### 方法1: Supabaseダッシュボードから設定（推奨）

1. Supabaseダッシュボード → Database → Webhooks
2. 「Create a new hook」をクリック
3. 以下のように設定:

| 項目 | 値 |
|------|-----|
| Name | `notify_private_booking` |
| Table | `reservations` |
| Events | ✅ Insert のみチェック |
| Type | HTTP Request |
| Method | POST |
| URL | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking` |

4. **HTTP Headers**を追加:
   - Key: `Authorization`
   - Value: `Bearer YOUR_ANON_KEY`（Project Settings → API → anon public からコピー）

5. **Conditions (SQL)**:
   ```sql
   reservation_source = 'web_private'
   ```

6. 「Create webhook」をクリック

### 方法2: SQLで設定

Supabaseダッシュボード → SQL Editor で以下を実行:

```sql
-- pg_netを有効化（まだの場合）
CREATE EXTENSION IF NOT EXISTS pg_net;

-- トリガー関数を作成
CREATE OR REPLACE FUNCTION notify_private_booking_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- reservation_sourceが'web_private'の場合のみ通知
  IF NEW.reservation_source = 'web_private' THEN
    PERFORM
      net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_ANON_KEY'
        ),
        body := jsonb_build_object(
          'type', 'insert',
          'table', 'reservations',
          'record', row_to_json(NEW),
          'old_record', NULL
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガーを作成
DROP TRIGGER IF EXISTS on_private_booking_created ON reservations;
CREATE TRIGGER on_private_booking_created
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION notify_private_booking_trigger();
```

## 7. テスト

1. アプリケーションから貸切予約を作成
2. Discordチャンネルに通知が届くことを確認

## トラブルシューティング

### 通知が届かない場合

**1. Edge Functionのログを確認**:
```bash
supabase functions logs notify-private-booking --follow
```

または、Supabaseダッシュボード → Edge Functions → notify-private-booking → Logs

**2. Webhookのログを確認**:
Supabaseダッシュボード → Database → Webhooks → notify_private_booking → Logs

**3. 環境変数を確認**:
```bash
supabase secrets list
```

**4. Discord Webhook URLをテスト**:
```bash
curl -X POST "YOUR_DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "テストメッセージ"}'
```

**5. 手動でEdge Functionをテスト**:
```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "insert",
    "table": "reservations",
    "record": {
      "id": "test-id",
      "customer_name": "テスト太郎",
      "customer_email": "test@example.com",
      "customer_phone": "090-1234-5678",
      "scenario_title": "テストシナリオ",
      "participant_count": 8,
      "candidate_datetimes": {
        "candidates": [
          {
            "order": 1,
            "date": "2025-10-15",
            "timeSlot": "夜",
            "startTime": "18:00",
            "endTime": "21:00"
          }
        ]
      },
      "created_at": "2025-10-12T10:00:00Z"
    }
  }'
```

## 通知内容のカスタマイズ

`supabase/functions/notify-private-booking/index.ts`を編集して、通知の見た目や内容をカスタマイズできます。

編集後は再デプロイ:
```bash
supabase functions deploy notify-private-booking
```

## 注意事項

- Discord Webhook URLは**絶対に公開しない**でください
- 環境変数として設定すれば、コードに直接書く必要はありません
- `@here`メンションを変更したい場合は、`content`部分を編集してください
  - `@here` → オンラインメンバーに通知
  - `@everyone` → 全メンバーに通知（非推奨）
  - メンション無し → 通知音なし

