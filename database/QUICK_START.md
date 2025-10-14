# シナリオマスターリスト インポート クイックスタート

## 3ステップでインポート完了！

### ステップ1: カラム追加
```sql
-- database/add_license_columns_v2.sql をSupabaseで実行
```

### ステップ2: UNIQUE制約追加
```sql
-- database/add_title_unique_constraint.sql をSupabaseで実行
```

### ステップ3: データインポート
```sql
-- database/import_scenarios_master_v2.sql をSupabaseで実行
```

## エラーが出た場合

### エラー: column "license_amount" does not exist
→ ステップ1を実行してください

### エラー: there is no unique or exclusion constraint
→ ステップ2を実行してください

### エラー: duplicate key value violates unique constraint
→ これは正常です。既存データが更新されています

## 命名規則

- **fee** = お客様から受け取る（収入）
- **amount** = 作者やGMに支払う（支出）

```
お客様 --[fee]--> 店舗 --[amount]--> 作者/GM
```

## 既存データの更新のみ行う場合

既にシナリオデータがインポート済みで、GMテスト関連の料金だけを更新したい場合：

### GMテスト参加費を更新
```sql
-- database/update_gm_test_participation_fee.sql をSupabaseで実行
```
既存の全シナリオの`gm_test_participation_fee`を`participation_fee - 1000円`に更新します。

### GMテストライセンス料を更新
```sql
-- database/update_gm_test_license_amount.sql をSupabaseで実行
```
`gm_test_license_amount`が0円で、`license_amount`が設定されている場合、通常ライセンス料をコピーします。

### 両方まとめて更新
```sql
-- database/update_all_gm_test_fees.sql をSupabaseで実行
```
上記2つを一度に実行します（推奨）。

## 詳細な説明

詳しい説明は `IMPORT_SCENARIOS_README_v2.md` を参照してください。

