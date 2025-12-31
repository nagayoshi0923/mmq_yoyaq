# 貸切予約通知の設定手順

貸切予約が申し込まれたときに、LINEとDiscordに通知を送る機能のセットアップ手順です。

## 1. LINE Notify トークンの取得

1. https://notify-bot.line.me/ にアクセス
2. 右上の「ログイン」からLINEアカウントでログイン
3. マイページ → 「トークンを発行する」
4. トークン名を入力（例: 「マーダーミステリー貸切予約」）
5. 通知を送信するトークルームを選択（個人なら「1:1でLINE Notifyから通知を受け取る」）
6. 「発行する」をクリック
7. 表示されたトークンをコピー（一度しか表示されないので注意）

## 2. Discord Webhook URLの取得

1. Discordで通知を受け取りたいチャンネルを開く
2. チャンネル設定 → 連携サービス → Webhooks
3. 「新しいウェブフック」をクリック
4. 名前を設定（例: 「貸切予約Bot」）
5. 「ウェブフックURLをコピー」をクリック

## 3. Supabase Edge Functionのデプロイ

### 3.1 Supabase CLIのインストール

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# その他
npm install -g supabase
```

### 3.2 Supabaseにログイン

```bash
supabase login
```

### 3.3 プロジェクトをリンク

```bash
cd /Users/nagayoshimai/mmq_yoyaq
supabase link --project-ref YOUR_PROJECT_REF
```

プロジェクトREFは、SupabaseダッシュボードのURLから取得できます：
`https://supabase.com/dashboard/project/【YOUR_PROJECT_REF】`

### 3.4 環境変数を設定

```bash
# LINE Notify トークンを設定
supabase secrets set LINE_NOTIFY_TOKEN=YOUR_LINE_NOTIFY_TOKEN

# Discord Webhook URLを設定
supabase secrets set DISCORD_WEBHOOK_URL=YOUR_DISCORD_WEBHOOK_URL

# サイトURLを設定（オプション）
supabase secrets set SITE_URL=https://your-domain.com
```

### 3.5 Edge Functionをデプロイ

```bash
supabase functions deploy notify-private-booking
```

## 4. Database WebhookまたはTriggerの設定

### オプション1: Database Webhook（推奨）

1. Supabaseダッシュボード → Database → Webhooks
2. 「Create a new hook」をクリック
3. 設定:
   - **Name**: `notify_private_booking`
   - **Table**: `reservations`
   - **Events**: `Insert` のみチェック
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-private-booking`
   - **HTTP Headers**:
     - Key: `Authorization`
     - Value: `Bearer YOUR_ANON_KEY`
   - **Conditions** (SQL): 
     ```sql
     reservation_source = 'web_private'
     ```
4. 「Create webhook」をクリック

### オプション2: Database Trigger（代替案）

```sql
-- Edge Functionを呼び出すトリガーを作成
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
          'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body := jsonb_build_object(
          'type', 'insert',
          'table', 'reservations',
          'record', row_to_json(NEW)
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを作成
CREATE TRIGGER on_private_booking_created
  AFTER INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION notify_private_booking_trigger();
```

## 5. テスト

1. アプリケーションから貸切予約を作成
2. LINEとDiscordに通知が届くことを確認

## トラブルシューティング

### 通知が届かない場合

1. **Edge Functionのログを確認**:
   ```bash
   supabase functions logs notify-private-booking
   ```

2. **Webhookのログを確認**:
   Supabaseダッシュボード → Database → Webhooks → 該当のWebhook → Logs

3. **環境変数を確認**:
   ```bash
   supabase secrets list
   ```

4. **LINEトークンを確認**:
   - トークンが正しいか
   - トークンが有効期限内か
   - LINE Notifyとの連携が解除されていないか

5. **Discord Webhook URLを確認**:
   - URLが正しいか
   - Webhookが削除されていないか

## 通知のカスタマイズ

`supabase/functions/notify-private-booking/index.ts`を編集して、通知メッセージをカスタマイズできます。

編集後は再デプロイ：
```bash
supabase functions deploy notify-private-booking
```

