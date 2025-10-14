# 全GMアサインメント一括インポート - 実行ガイド

## 概要

提供いただいたGMリストデータから、全スタッフとシナリオの紐づけを一括登録します。

## ファイル構成

全データを6つのパートに分割しています：

| ファイル名 | 内容 | シナリオ数 |
|-----------|------|-----------|
| import_all_gm_assignments.sql | パート1 | 約20シナリオ |
| import_all_gm_assignments_part2.sql | パート2 | 約20シナリオ |
| import_all_gm_assignments_part3.sql | パート3 | 約30シナリオ |
| import_all_gm_assignments_part4.sql | パート4 | 約20シナリオ |
| import_all_gm_assignments_part5.sql | パート5 | 約20シナリオ |
| import_all_gm_assignments_part6.sql | パート6（最終） | 残りのシナリオ |

## 実行前の準備

### 必須ステップ（順番通りに実行）

```sql
-- 1. GMシステムのテーブル拡張
-- database/redesign_gm_system_v3.sql

-- 2. シナリオデータのインポート
-- database/add_license_columns_v2.sql
-- database/add_title_unique_constraint.sql
-- database/import_scenarios_master_v2.sql

-- 3. スタッフデータのインポート
-- database/import_staff_master_simple.sql
-- database/add_staff_name_unique.sql
```

## 実行順序

### ステップ1: パート1を実行

```sql
-- database/import_all_gm_assignments.sql をSupabaseで実行
```

**確認:**
```sql
SELECT COUNT(*) FROM staff_scenario_assignments;
-- 数百件のレコードが登録されているはず
```

### ステップ2~6: 残りのパートを順次実行

```sql
-- database/import_all_gm_assignments_part2.sql
-- database/import_all_gm_assignments_part3.sql
-- database/import_all_gm_assignments_part4.sql
-- database/import_all_gm_assignments_part5.sql
-- database/import_all_gm_assignments_part6.sql
```

各パート実行後、エラーがないか確認してください。

## スタッフ名のマッピング

元データの表記ゆれを統一しています：

| 元データ | データベース登録名 |
|---------|------------------|
| えなみ/えなみん | 江波（えなみん） |
| きゅう/キュウ | きゅう |
| れみあ | Remia（れみあ） |
| まつい | 松井（まつい） |
| ぽん | ぽんちゃん |
| じの | 八継じの |
| そら/ソラ/ソウタン | ソラ |
| labo/らぼ | labo |
| モリシ/もりし | イワセモリシ |
| ソルト | 藤崎ソルト |

## 特殊なシナリオ

### 2人GM必要なシナリオ

以下のシナリオは詳細な分類があります：

#### モノクローム
- **メイン・サブ両方可能**: りえぞー、しらやま
- **メインのみ可能**: えりん、崎、じの
- **サブのみ可能**: みずき、きゅう、labo、モリシ

#### 不思議の国の童話裁判
- **メイン・サブ（アリス）両方可能**: みずき、りえぞー、えりん
- **メインのみ可能**: つばめ、じの
- **サブ（アリス）のみ可能**: きゅう

## 確認クエリ

### 全体の統計

```sql
SELECT 
  COUNT(DISTINCT scenario_id) as シナリオ数,
  COUNT(DISTINCT staff_id) as スタッフ数,
  COUNT(*) as 総アサイン数,
  COUNT(*) FILTER (WHERE can_main_gm) as メインGM可能,
  COUNT(*) FILTER (WHERE can_sub_gm) as サブGM可能
FROM staff_scenario_assignments;
```

### スタッフ別のGM可能シナリオ

```sql
SELECT 
  s.name as スタッフ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能,
  COUNT(*) FILTER (WHERE ssa.can_sub_gm) as サブGM可能
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
GROUP BY s.name
ORDER BY COUNT(*) FILTER (WHERE ssa.can_main_gm) DESC;
```

### シナリオ別のGM可能人数

```sql
SELECT 
  sc.title as シナリオ名,
  COUNT(*) FILTER (WHERE ssa.can_main_gm) as メインGM可能人数
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
GROUP BY sc.title
ORDER BY COUNT(*) FILTER (WHERE ssa.can_main_gm) DESC;
```

### 特定シナリオのGM可能スタッフ

```sql
SELECT 
  s.name as スタッフ名,
  CASE 
    WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN 'メイン・サブ両方可能'
    WHEN ssa.can_main_gm THEN 'メインGM可能'
    WHEN ssa.can_sub_gm THEN 'サブGMのみ可能'
    WHEN ssa.is_experienced THEN '体験済み'
  END as 習熟度,
  array_to_string(s.ng_days, ', ') as NG曜日
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'グロリアメモリーズ'
ORDER BY ssa.can_main_gm DESC, ssa.can_sub_gm DESC, s.name;
```

## トラブルシューティング

### エラー: relation "staff_scenario_assignments" does not exist

**原因:** テーブルが作成されていません。

**解決:** `database/create_tables.sql` を実行してください。

### エラー: column "can_main_gm" does not exist

**原因:** GMシステムの拡張が実行されていません。

**解決:** `database/redesign_gm_system_v3.sql` を実行してください。

### エラー: insert or update on table violates foreign key constraint

**原因:** スタッフまたはシナリオのデータが存在しません。

**解決:** 
1. `database/import_scenarios_master_v2.sql` を実行
2. `database/import_staff_master_simple.sql` を実行

### 一部のスタッフが見つからない

元データに含まれるが、データベースに登録されていないスタッフ：
- ぽったー、ミカノハ、だいこん、kanade、渚咲、温風リン、奏兎、BB、楽

これらは`import_staff_master_simple.sql`に含まれていません。
必要に応じて手動で追加してください。

## データの特徴

- **総シナリオ数**: 100以上
- **総スタッフ数**: 25名（登録済み）
- **総アサイン数**: 数千件
- **2人GM必要**: モノクローム、不思議の国の童話裁判

## 次のステップ

1. 全6パートのSQLを順次実行
2. 確認クエリで結果を検証
3. 不足しているスタッフを追加（任意）
4. フロントエンドでGMアサイン機能を実装

## メンテナンス

新しいシナリオや新しいスタッフが追加された場合：

```sql
-- 新しいGMアサイン
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'スタッフ名'),
  (SELECT id FROM scenarios WHERE title = 'シナリオ名'),
  true,
  NOW()
)
ON CONFLICT (staff_id, scenario_id) DO UPDATE 
SET can_main_gm = true, can_gm_at = NOW();
```

