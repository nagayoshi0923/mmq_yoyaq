# 設定テーブルのセットアップ手順

## 概要
設定機能を使用するために、データベースに設定テーブルを作成する必要があります。

## 前提条件
- Supabaseプロジェクトが作成されていること
- 管理者権限でSupabaseダッシュボードにアクセスできること

## セットアップ手順

### 1. Supabaseダッシュボードにアクセス

1. [Supabase Dashboard](https://supabase.com/dashboard)にログイン
2. プロジェクトを選択

### 2. SQL Editorを開く

1. 左側のメニューから「SQL Editor」をクリック
2. 「New query」をクリック

### 3. SQLスクリプトを実行

1. `database/create_settings_tables.sql`の内容をコピー
2. SQL Editorにペースト
3. 「Run」ボタンをクリックして実行

### 4. 実行結果の確認

以下のテーブルが作成されます：

- ✅ `store_basic_settings` - 店舗基本設定
- ✅ `business_hours_settings` - 営業時間設定
- ✅ `performance_schedule_settings` - 公演スケジュール設定
- ✅ `reservation_settings` - 予約設定
- ✅ `pricing_settings` - 料金設定
- ✅ `email_settings` - メール設定
- ✅ `notification_settings` - 通知設定
- ✅ `staff_settings` - スタッフ設定
- ✅ `system_settings` - システム設定
- ✅ `customer_settings` - 顧客設定
- ✅ `data_management_settings` - データ管理設定
- ✅ `sales_report_settings` - 売上レポート設定

### 5. テーブル作成の確認

以下のSQLを実行してテーブルが作成されたことを確認します：

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%_settings'
ORDER BY table_name;
```

12個のテーブルが表示されれば成功です。

## トラブルシューティング

### エラー: function update_updated_at_column() does not exist

`update_updated_at_column()` 関数が存在しない場合は、以下のSQLを先に実行してください：

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
```

### エラー: relation already exists

すでにテーブルが存在する場合は、以下のいずれかを実行してください：

**オプション1: テーブルを削除して再作成**
```sql
DROP TABLE IF EXISTS store_basic_settings CASCADE;
DROP TABLE IF EXISTS business_hours_settings CASCADE;
DROP TABLE IF EXISTS performance_schedule_settings CASCADE;
DROP TABLE IF EXISTS reservation_settings CASCADE;
DROP TABLE IF EXISTS pricing_settings CASCADE;
DROP TABLE IF EXISTS email_settings CASCADE;
DROP TABLE IF EXISTS notification_settings CASCADE;
DROP TABLE IF EXISTS staff_settings CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS customer_settings CASCADE;
DROP TABLE IF EXISTS data_management_settings CASCADE;
DROP TABLE IF EXISTS sales_report_settings CASCADE;
```

その後、`create_settings_tables.sql`を再度実行してください。

**オプション2: 既存のテーブルをそのまま使用**
スキーマが一致していれば、既存のテーブルを使用できます。

## 初期データの投入（オプション）

各店舗のデフォルト設定を作成する場合は、以下のSQLを実行してください：

```sql
-- 各店舗のデフォルト設定を作成
INSERT INTO performance_schedule_settings (store_id, performances_per_day, performance_times, preparation_time, default_duration)
SELECT 
  id,
  2,
  '[{"slot": "afternoon", "start_time": "14:00"}, {"slot": "evening", "start_time": "18:00"}]'::jsonb,
  30,
  180
FROM stores
ON CONFLICT (store_id) DO NOTHING;

-- 営業時間のデフォルト設定
INSERT INTO business_hours_settings (store_id, opening_hours)
SELECT 
  id,
  '{
    "monday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "tuesday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "wednesday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "thursday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "friday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "saturday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"},
    "sunday": {"is_open": true, "open_time": "10:00", "close_time": "22:00"}
  }'::jsonb
FROM stores
ON CONFLICT (store_id) DO NOTHING;

-- その他の設定も同様に作成
INSERT INTO reservation_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO pricing_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO email_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO notification_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO staff_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO system_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO customer_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO data_management_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
INSERT INTO sales_report_settings (store_id) SELECT id FROM stores ON CONFLICT (store_id) DO NOTHING;
```

## 完了

これで設定機能が正常に動作するようになります。

アプリケーションをリロードして、設定画面から各種設定を保存できることを確認してください。
