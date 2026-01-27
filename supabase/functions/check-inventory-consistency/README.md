# 在庫整合性チェック Edge Function

## 📋 概要

日次で実行され、`schedule_events.current_participants` と実際の予約数を比較し、不整合があれば自動修正してSlackに通知します。

## 🔄 処理フロー

1. 過去30日〜未来90日のイベントをチェック
2. 各イベントの `current_participants` と実際の予約数を比較
3. **不整合があれば自動修正**
4. 不整合が見つかった場合、**Slackに通知**
5. 実行結果を `inventory_consistency_logs` テーブルに記録

## 📦 依存関係

- `inventory_consistency_logs` テーブル（migration 009で作成）
- `check_and_fix_inventory_consistency()` 関数（同上）
- `run_inventory_consistency_check()` 関数（同上）
- Slack Webhook URL（オプション）

## 🚀 デプロイ手順

### 方法A: Supabase Dashboard（推奨）

#### 1. マイグレーションを実行

```sql
-- SQL Editor で実行
-- migration 009 の内容を実行
```

#### 2. Edge Functions → Create a new function

1. **Via Editor** を選択
2. **Function name**: `check-inventory-consistency`
3. コードを貼り付け
4. **Deploy** をクリック

#### 3. Slack Webhook URL を設定（オプション）

Slackに通知したい場合：

1. **Settings** → **Edge Functions** → **check-inventory-consistency**
2. **Environment Variables** を開く
3. **Add variable** をクリック

```
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Slack Webhook URL の取得方法:**
1. https://api.slack.com/apps にアクセス
2. アプリを作成 → **Incoming Webhooks** を有効化
3. Webhook URL をコピー

#### 4. Cron設定（日次実行）

**Database** → **SQL Editor** で実行:

```sql
-- 毎日午前3時に実行
SELECT cron.schedule(
  'check-inventory-consistency',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-inventory-consistency',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
```

---

## 🧪 テスト方法

### 手動実行

**Edge Functions** → **check-inventory-consistency** → **Test** タブ

または:

```bash
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-inventory-consistency' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

**期待されるレスポンス:**
```json
{
  "success": true,
  "total_checked": 150,
  "inconsistencies_found": 3,
  "auto_fixed": 3,
  "execution_time_ms": 245,
  "details": [...]
}
```

### データベースで確認

```sql
-- 最新のチェック結果
SELECT * FROM inventory_consistency_logs
ORDER BY checked_at DESC
LIMIT 10;

-- 不整合が見つかったログのみ
SELECT * FROM inventory_consistency_logs
WHERE inconsistencies_found > 0
ORDER BY checked_at DESC;

-- 統計
SELECT 
  DATE(checked_at) as date,
  COUNT(*) as checks,
  SUM(total_checked) as total_events,
  SUM(inconsistencies_found) as total_inconsistencies,
  SUM(auto_fixed) as total_fixed
FROM inventory_consistency_logs
WHERE checked_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(checked_at)
ORDER BY date DESC;
```

---

## 📊 監視

### Edge Functions ログ

**Edge Functions** → **check-inventory-consistency** → **Logs**

**期待されるログ:**
```
🔍 Starting inventory consistency check...
✅ Consistency check completed: {total_checked: 150, inconsistencies_found: 0, ...}
```

**不整合が見つかった場合:**
```
🔍 Starting inventory consistency check...
✅ Consistency check completed: {total_checked: 150, inconsistencies_found: 3, ...}
✅ Slack notification sent
```

### Slack通知（設定した場合）

不整合が見つかると、以下のようなメッセージがSlackに届きます：

```
🔍 在庫整合性チェック結果

• チェック対象: 150 イベント
• 不整合検出: 3 イベント
• 自動修正: 3 イベント
• 実行時間: 245ms

不整合の詳細:

• 蝉散 (Queen's Waltz本店)
  日時: 2026-02-01 18:00:00
  保存値: 5 → 実際: 7 (差分: -2)

• 蟻集 (Queen's Waltz本店)
  日時: 2026-02-03 19:00:00
  保存値: 10 → 実際: 8 (差分: +2)
```

---

## 🔧 トラブルシューティング

### 不整合が頻繁に発生する

**原因**: RPC以外の方法で予約が作成/キャンセルされている

**解決策**:
1. 全ての予約作成は `create_reservation_with_lock` を使用
2. 全てのキャンセルは `cancel_reservation_with_lock` を使用
3. 古いコードを探して修正

### Slack通知が届かない

**原因1**: `SLACK_WEBHOOK_URL` が設定されていない

**解決策**: Edge Function の環境変数を確認

**原因2**: Webhook URL が間違っている

**解決策**: Slackで新しいWebhook URLを生成して再設定

### 実行時間が長い

**原因**: チェック対象のイベント数が多い

**解決策**:
- チェック期間を調整（現在は過去30日〜未来90日）
- インデックスが正しく設定されているか確認

---

## 🧹 メンテナンス

### 古いログを削除

90日以上前のログを自動削除:

```sql
-- 手動実行
SELECT cleanup_inventory_consistency_logs();

-- または Cron で自動実行（月次）
SELECT cron.schedule(
  'cleanup-inventory-logs',
  '0 4 1 * *',  -- 毎月1日午前4時
  $$
  SELECT cleanup_inventory_consistency_logs();
  $$
);
```

---

## 📝 関連ドキュメント

- [Migration 009](../../migrations/009_inventory_consistency_check.sql) - 関数定義
- [CRITICAL_FIXES_PLAN.md](../../../docs/CRITICAL_FIXES_PLAN.md) - 実装計画

