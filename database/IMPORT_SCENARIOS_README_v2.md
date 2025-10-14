# シナリオマスターリストのインポート手順（命名規則整理版）

このガイドでは、命名規則を整理したシナリオマスターリストをデータベースにインポートする手順を説明します。

## 命名規則

**fee = お客様から受け取る金額**
**amount = 作者やGMに支払う金額**

```
お客様 → [fee] → 店舗 → [amount] → 作者/GM
```

## データベーススキーマ

| カラム名 | 説明 | 例 |
|---------|------|---|
| `participation_fee` | 通常公演：お客様から受け取る参加費 | 5,000円 |
| `license_amount` | 通常公演：作者に支払うライセンス料 | 10,000円 |
| `gm_test_participation_fee` | GMテスト公演：お客様から受け取る参加費 | 3,000円 |
| `gm_test_license_amount` | GMテスト公演：作者に支払うライセンス料 | 3,500円 |
| `gm_reward_amount` | GM報酬：GMスタッフに支払う金額 | 2,000円 |

## 実行順序

### ステップ1: データベースカラムの追加

まず、必要なカラムをscenariosテーブルに追加します。

1. Supabase DashboardのSQL Editorを開く
2. `database/add_license_columns_v2.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/add_license_columns_v2.sql
```

このスクリプトは以下のカラムを追加します：
- `license_amount` (INTEGER): 通常公演：作者に支払うライセンス料
- `gm_test_license_amount` (INTEGER): GMテスト公演：作者に支払うライセンス料
- `gm_test_participation_fee` (INTEGER): GMテスト公演：お客様から受け取る参加費
- `gm_reward_amount` (INTEGER): GM報酬：GMスタッフに支払う金額

### ステップ2: UNIQUE制約の追加

titleカラムにUNIQUE制約を追加し、重複したシナリオ登録を防ぎます。

1. Supabase DashboardのSQL Editorを開く
2. `database/add_title_unique_constraint.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/add_title_unique_constraint.sql
```

このスクリプトは：
- 既存の重複データをチェック
- titleカラムにUNIQUE制約を追加
- ON CONFLICTでのデータ更新を可能にします

### ステップ3: シナリオデータのインポート

制約が追加されたら、シナリオデータをインポートします。

1. Supabase DashboardのSQL Editorを開く
2. `database/import_scenarios_master_v2.sql`の内容をコピー&ペースト
3. 実行する

**実行するSQL:**
```sql
-- database/import_scenarios_master_v2.sql
```

このスクリプトは以下を実行します：
- 190以上のシナリオをインポート
- 既存のシナリオは更新（ON CONFLICT使用）
- インポート後に統計を表示

## データの例

### 例1: 通常公演のみのシナリオ

**グロリアメモリーズ**
- `participation_fee`: 5,000円（お客様から受け取る）
- `license_amount`: 10,000円（作者に支払う）
- `gm_test_license_amount`: 0円（GMテストなし）

### 例2: GMテストありのシナリオ

**曙光のエテルナ**
- `participation_fee`: 4,500円（通常公演：お客様から受け取る）
- `license_amount`: 5,000円（通常公演：作者に支払う）
- `gm_test_license_amount`: 3,500円（GMテスト：作者に支払う）
- `gm_test_participation_fee`: 未設定（後で手動設定可能）

### 例3: GM報酬を設定する場合

```sql
UPDATE scenarios
SET gm_reward_amount = 2000
WHERE title = 'グロリアメモリーズ';
```

## 収益計算の例

### 通常公演の場合

**グロリアメモリーズ（10人）**
```
収入: 5,000円 × 10人 = 50,000円
支出: 10,000円（ライセンス料） + 2,000円（GM報酬） = 12,000円
粗利: 50,000円 - 12,000円 = 38,000円
```

### GMテスト公演の場合

**曙光のエテルナ（8人）**
```
収入: 3,000円 × 8人 = 24,000円（GMテスト参加費を設定した場合）
支出: 3,500円（GMテストライセンス料） + 1,500円（GM報酬） = 5,000円
粗利: 24,000円 - 5,000円 = 19,000円
```

## 確認方法

インポート後、以下のSQLで確認できます：

### 基本統計

```sql
SELECT 
  COUNT(*) as total_scenarios,
  COUNT(CASE WHEN status = 'available' THEN 1 END) as available_scenarios,
  COUNT(CASE WHEN license_amount > 0 THEN 1 END) as with_license,
  COUNT(CASE WHEN gm_test_license_amount > 0 THEN 1 END) as with_gm_test,
  ROUND(AVG(participation_fee)) as avg_participation_fee,
  ROUND(AVG(license_amount)) as avg_license_amount
FROM scenarios;
```

### 料金別集計

```sql
-- 参加費別のシナリオ数
SELECT 
  participation_fee,
  COUNT(*) as scenario_count
FROM scenarios
WHERE participation_fee > 0
GROUP BY participation_fee
ORDER BY participation_fee DESC;

-- ライセンス料別のシナリオ数
SELECT 
  license_amount,
  COUNT(*) as scenario_count,
  STRING_AGG(title, ', ' ORDER BY title) as scenarios
FROM scenarios
WHERE license_amount > 0
GROUP BY license_amount
ORDER BY license_amount DESC
LIMIT 10;
```

### GMテストありのシナリオ

```sql
SELECT 
  title,
  author,
  participation_fee as 通常参加費,
  license_amount as 通常ライセンス料,
  gm_test_license_amount as GMテストライセンス料,
  ROUND((gm_test_license_amount::FLOAT / license_amount * 100), 0) || '%' as GMテスト割合
FROM scenarios
WHERE gm_test_license_amount > 0
ORDER BY license_amount DESC;
```

### 収益性分析

```sql
-- 参加費とライセンス料の比率分析
SELECT 
  title,
  author,
  player_count_max as 最大人数,
  participation_fee as 参加費,
  license_amount as ライセンス料,
  (participation_fee * player_count_max) as 最大収入,
  (participation_fee * player_count_max - license_amount) as 最大粗利
FROM scenarios
WHERE 
  status = 'available' 
  AND participation_fee > 0 
  AND license_amount > 0
ORDER BY (participation_fee * player_count_max - license_amount) DESC
LIMIT 20;
```

## トラブルシューティング

### エラー: column "license_amount" does not exist

**原因:** ステップ1の`add_license_columns_v2.sql`が実行されていません。

**解決方法:** 
1. `database/add_license_columns_v2.sql`を実行
2. その後、他のステップを順番に実行

### エラー: there is no unique or exclusion constraint matching the ON CONFLICT specification

**原因:** ステップ2の`add_title_unique_constraint.sql`が実行されていません。

**解決方法:** 
1. `database/add_title_unique_constraint.sql`を実行
2. その後、`database/import_scenarios_master_v2.sql`を再実行

### エラー: duplicate key value violates unique constraint "scenarios_title_unique"

**原因:** データベースに既に同じタイトルのシナリオが存在しています。

**解決方法:** これは正常です。ON CONFLICTにより既存データが自動的に更新されます。エラーメッセージが表示される場合は、SQLファイルの`ON CONFLICT`句を確認してください。

### 既存のgm_feeカラムとの統合

既存の`gm_fee`カラムがある場合、以下のSQLで`gm_reward_amount`に移行できます：

```sql
-- データを移行
UPDATE scenarios 
SET gm_reward_amount = gm_fee 
WHERE gm_fee IS NOT NULL AND gm_fee > 0;

-- 確認
SELECT title, gm_fee, gm_reward_amount 
FROM scenarios 
WHERE gm_fee > 0 OR gm_reward_amount > 0;

-- 問題なければgm_feeカラムを削除（任意）
-- ALTER TABLE scenarios DROP COLUMN gm_fee;
```

## データのメンテナンス

### GMテスト参加費の一括設定

GMテスト参加費を通常参加費の70%に設定する例：

```sql
UPDATE scenarios
SET gm_test_participation_fee = ROUND(participation_fee * 0.7)
WHERE gm_test_license_amount > 0;
```

### GM報酬の一括設定

全シナリオにGM報酬を2,000円に設定する例：

```sql
UPDATE scenarios
SET gm_reward_amount = 2000
WHERE status = 'available';
```

### 個別シナリオの更新

```sql
UPDATE scenarios
SET 
  participation_fee = 6000,
  license_amount = 12000,
  gm_test_participation_fee = 4000,
  gm_test_license_amount = 8000,
  gm_reward_amount = 2500,
  updated_at = NOW()
WHERE title = 'グロリアメモリーズ';
```

## データ構造の利点

### 1. 明確な命名規則
- `fee`: 収入（お客様から受け取る）
- `amount`: 支出（作者やGMに支払う）

### 2. 柔軟な料金設定
- 通常公演とGMテスト公演で別々の料金設定
- GM報酬も個別に管理可能

### 3. 簡単な収益計算
```sql
SELECT 
  title,
  (participation_fee * player_count_max) as 最大収入,
  license_amount + COALESCE(gm_reward_amount, 0) as 総支出,
  (participation_fee * player_count_max) - (license_amount + COALESCE(gm_reward_amount, 0)) as 最大粗利
FROM scenarios
WHERE status = 'available';
```

## 備考

- 元のExcelマスターリストから抽出されたデータです
- 作者が不明な場合は「不明」として登録されています
- 所要時間は平均値を分単位で登録しています
- GMテスト参加費は任意項目です（後で設定可能）
- GM報酬も任意項目です（各店舗の方針に応じて設定）

