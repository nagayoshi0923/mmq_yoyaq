# シナリオマスターリストのインポート手順

このガイドでは、シナリオマスターリストをデータベースにインポートする手順を説明します。

## 前提条件

- Supabaseプロジェクトへのアクセス権限
- SQL Editorの使用権限

## 実行順序

### ステップ1: データベースカラムの追加

まず、`license_amount`と`gm_test_fee`カラムをscenariosテーブルに追加します。

1. Supabase DashboardのSQL Editorを開く
2. `database/add_license_columns.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/add_license_columns.sql
```

このスクリプトは以下のカラムを追加します：
- `license_amount` (INTEGER): ライセンス料（円）
- `gm_test_fee` (INTEGER): GMテスト料金（円）

### ステップ2: シナリオデータのインポート

カラムが追加されたら、シナリオデータをインポートします。

1. Supabase DashboardのSQL Editorを開く
2. `database/import_scenarios_master.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/import_scenarios_master.sql
```

このスクリプトは以下を実行します：
- 190以上のシナリオをインポート
- 既存のシナリオは更新（ON CONFLICT使用）
- インポート後に統計を表示

## インポートされるデータ

各シナリオには以下の情報が含まれます：

| カラム名 | 説明 | 例 |
|---------|------|---|
| title | シナリオ名 | グロリアメモリーズ |
| author | 作者名 | リン |
| duration | 所要時間（分） | 270 |
| player_count_min | 最小人数 | 10 |
| player_count_max | 最大人数 | 10 |
| difficulty | 難易度（1-5） | 3 |
| participation_fee | 参加費（円） | 5000 |
| license_amount | ライセンス料（円） | 10000 |
| gm_test_fee | GMテスト料金（円） | 0 |
| status | ステータス | available/maintenance/retired |
| notes | 備考 | 4~4.5時間 |

## ステータスの種類

- `available`: 公演可能
- `maintenance`: 準備中・公演未定
- `retired`: 公演停止中・公演やってない

## 確認方法

インポート後、以下のSQLで確認できます：

```sql
-- 総数確認
SELECT COUNT(*) as total FROM scenarios;

-- ステータス別集計
SELECT 
  status,
  COUNT(*) as count
FROM scenarios
GROUP BY status
ORDER BY count DESC;

-- 作者別集計
SELECT 
  author,
  COUNT(*) as scenario_count
FROM scenarios
WHERE author != '不明'
GROUP BY author
ORDER BY scenario_count DESC
LIMIT 10;

-- ライセンス料が設定されているシナリオ
SELECT 
  title,
  author,
  license_amount,
  gm_test_fee
FROM scenarios
WHERE license_amount > 0
ORDER BY license_amount DESC
LIMIT 20;
```

## トラブルシューティング

### エラー: column "license_amount" does not exist

**原因:** ステップ1の`add_license_columns.sql`が実行されていません。

**解決方法:** 
1. `database/add_license_columns.sql`を実行
2. その後、`database/import_scenarios_master.sql`を再実行

### エラー: duplicate key value violates unique constraint

**原因:** すでに同じタイトルのシナリオが存在します。

**解決方法:** これは正常です。ON CONFLICTにより既存データが更新されます。エラーが出る場合は、SQLファイルの`ON CONFLICT`部分を確認してください。

### データが古い場合

すべてのシナリオデータを削除してインポートし直す場合：

```sql
-- ⚠️ 注意: すべてのシナリオデータが削除されます
DELETE FROM scenarios;

-- その後、import_scenarios_master.sqlを実行
```

## データのメンテナンス

### 個別シナリオの更新

```sql
UPDATE scenarios
SET 
  participation_fee = 6000,
  license_amount = 12000,
  updated_at = NOW()
WHERE title = 'グロリアメモリーズ';
```

### 一括ステータス変更

```sql
-- 準備中のシナリオをすべて公演可能に変更
UPDATE scenarios
SET status = 'available', updated_at = NOW()
WHERE status = 'maintenance';
```

## 備考

- データは元のExcelマスターリストから抽出されています
- 作者が不明な場合は「不明」として登録されています
- 所要時間は平均値を分単位で登録しています（例：4~4.5時間 → 270分）
- GMテスト料金は元データに記載があるシナリオのみ設定されています

