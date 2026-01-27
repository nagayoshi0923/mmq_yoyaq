# キャンセル待ち通知リトライキュー処理 Edge Function

## 📋 概要

失敗したキャンセル待ち通知を自動でリトライする Edge Function。
Cronで5分ごとに実行され、`waitlist_notification_queue` テーブルから `pending` 状態のレコードを処理します。

## 🔄 処理フロー

1. `waitlist_notification_queue` から `pending` 状態のレコードを取得（最大10件）
2. 各レコードに対してメール送信処理を実行
3. **成功**: `status = 'completed'` に更新
4. **失敗**: `retry_count` をインクリメント、最大3回までリトライ
5. **3回失敗**: `status = 'failed'` に更新

## 📦 依存関係

- `waitlist_notification_queue` テーブル（migration `008_waitlist_notification_retry_queue.sql`）
- `process_waitlist_notification_queue()` 関数（同上）
- Resend API（メール送信）

## 🚀 デプロイ手順

### 1. Edge Function をデプロイ

```bash
# Supabase CLI でログイン
supabase login

# プロジェクトにリンク
supabase link --project-ref YOUR_PROJECT_REF

# Edge Function をデプロイ
supabase functions deploy process-waitlist-queue
```

### 2. Cron設定（Supabase Dashboard）

1. Supabase Dashboard → Database → Cron Jobs
2. 「New Cron Job」をクリック
3. 以下の設定で作成：

```sql
-- 5分ごとに実行
SELECT cron.schedule(
  'process-waitlist-queue',  -- ジョブ名
  '*/5 * * * *',              -- 5分ごと
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-waitlist-queue',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

**または**、pg_cron を使用する場合：

```sql
-- 5分ごとに実行
SELECT cron.schedule(
  'process-waitlist-queue',
  '*/5 * * * *',
  $$
  SELECT process_waitlist_notification_queue();
  $$
);
```

### 3. Cron設定（ローカル開発）

ローカル開発では、手動で実行するか、以下のコマンドでテストします：

```bash
# ローカルで Edge Function を起動
supabase functions serve process-waitlist-queue

# 別のターミナルで実行
curl -i --location --request POST 'http://localhost:54321/functions/v1/process-waitlist-queue' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

## 🧪 テスト方法

### 手動テスト

1. キャンセル待ち通知を失敗させる（テスト環境で）
2. `waitlist_notification_queue` テーブルにレコードが挿入されることを確認
3. Edge Function を手動実行
4. レコードの `status` が `completed` に更新されることを確認

```sql
-- キューの確認
SELECT * FROM waitlist_notification_queue
ORDER BY created_at DESC
LIMIT 10;

-- 処理済みキューの確認
SELECT * FROM waitlist_notification_queue
WHERE status = 'completed'
ORDER BY updated_at DESC
LIMIT 10;

-- 失敗したキューの確認
SELECT * FROM waitlist_notification_queue
WHERE status = 'failed'
ORDER BY updated_at DESC
LIMIT 10;
```

## 📊 監視

### ログの確認

```bash
# Supabase Dashboard → Edge Functions → process-waitlist-queue → Logs
# または
supabase functions logs process-waitlist-queue
```

### 重要なログメッセージ

- `🔄 Starting waitlist queue processing...` - 処理開始
- `📋 Found X queue entries to process` - 処理対象のキュー数
- `✅ Queue entry X completed` - キュー処理成功
- `❌ Error processing queue entry X` - キュー処理失敗
- `✅ Processed: X success, Y failed` - 処理結果サマリー

## 🔧 トラブルシューティング

### キューが処理されない

1. Cron設定を確認
2. Edge Function のデプロイ状態を確認
3. RESEND_API_KEY が設定されているか確認
4. ログでエラーを確認

### メール送信が失敗する

1. Resend APIキーが正しいか確認
2. 送信元メールアドレスが検証済みか確認
3. レート制限に達していないか確認

### リトライ回数を変更したい

`index.ts` の `MAX_RETRIES` 定数を変更してデプロイします。

```typescript
const MAX_RETRIES = 3  // デフォルト: 3回
```

## 🔒 セキュリティ

- Edge Function は `SUPABASE_SERVICE_ROLE_KEY` を使用
- Cron実行時は認証が必要
- 失敗したキューのエラーメッセージは `last_error` に記録

## 🧹 メンテナンス

### 古いキューレコードの削除

30日以上経過した completed/failed レコードを自動削除する関数が用意されています：

```sql
-- 手動実行
SELECT cleanup_waitlist_notification_queue();

-- または Cron で自動実行（日次）
SELECT cron.schedule(
  'cleanup-waitlist-queue',
  '0 3 * * *',  -- 毎日午前3時
  $$
  SELECT cleanup_waitlist_notification_queue();
  $$
);
```

## 📝 関連ドキュメント

- [Migration 008](../../migrations/008_waitlist_notification_retry_queue.sql) - テーブル定義
- [notify-waitlist Edge Function](../notify-waitlist/index.ts) - 元の通知関数
- [CRITICAL_FIXES_PLAN.md](../../../docs/CRITICAL_FIXES_PLAN.md) - 実装計画

