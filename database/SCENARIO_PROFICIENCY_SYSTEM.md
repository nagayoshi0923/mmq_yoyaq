# スタッフのシナリオ習熟度管理システム

## 概要

スタッフがシナリオに対してどの程度習熟しているかを管理するシステムです。

## 習熟度のレベル

```
1. 覚えたい (want_to_learn)
   ↓ プレイヤーとして参加
2. 体験済み (experienced)
   ↓ GMテスト合格
3. GM可能 (can_gm)
   ↓ 経験を積む
4. メインGM可能 (main_gm)
```

## 実装方法

### 方法1: staffテーブルに配列カラムを追加（シンプル）

**メリット:**
- シンプルで直感的
- クエリが簡単

**デメリット:**
- 日付などの詳細情報を保存できない
- 柔軟性が低い

**カラム:**
- `experienced_scenarios TEXT[]` - 体験済みシナリオ
- `available_scenarios TEXT[]` - GM可能なシナリオ（既存）
- `want_to_learn TEXT[]` - 覚えたいシナリオ（既存）

**SQLファイル:** `add_experienced_scenarios.sql`

### 方法2: staff_scenario_assignmentsテーブルを拡張（推奨）

**メリット:**
- 習熟度の詳細（日付、メモ）を管理できる
- 複雑なクエリに対応可能
- 履歴を残せる

**デメリット:**
- クエリがやや複雑

**カラム:**
- `status` - 習熟度（want_to_learn, experienced, can_gm, main_gm）
- `experienced_at` - 体験した日時
- `can_gm_at` - GM可能になった日時
- `notes` - 備考（既存）

**SQLファイル:** `enhance_staff_scenario_assignments.sql`

## 推奨実装

**方法2（staff_scenario_assignmentsテーブルの拡張）を推奨します。**

理由:
- より柔軟な管理が可能
- 日付情報を保存できる
- レポート作成が容易

## 実装手順

### ステップ1: テーブル拡張

```sql
-- database/enhance_staff_scenario_assignments.sql をSupabaseで実行
```

### ステップ2: データ登録

提供いただいたGMリストから、スタッフとシナリオの紐づけを一括登録します。

## データ構造

### staff_scenario_assignments テーブル

| カラム名 | 型 | 説明 |
|---------|---|------|
| staff_id | UUID | スタッフID |
| scenario_id | UUID | シナリオID |
| status | TEXT | 習熟度 |
| assigned_at | TIMESTAMPTZ | 登録日時 |
| experienced_at | TIMESTAMPTZ | 体験日 |
| can_gm_at | TIMESTAMPTZ | GM可能日 |
| notes | TEXT | 備考 |

### statusの値

| 値 | 説明 |
|----|------|
| want_to_learn | 覚えたい（まだ遊んだことがない） |
| experienced | 体験済み（プレイヤーとして遊んだが、GMはまだできない） |
| can_gm | GM可能（サブGMができる） |
| main_gm | メインGM可能（メインGMができる） |

## クエリ例

### スタッフの習熟度を確認

```sql
SELECT 
  s.name as スタッフ名,
  COUNT(CASE WHEN ssa.status = 'want_to_learn' THEN 1 END) as 覚えたい,
  COUNT(CASE WHEN ssa.status = 'experienced' THEN 1 END) as 体験済み,
  COUNT(CASE WHEN ssa.status = 'can_gm' THEN 1 END) as GM可能,
  COUNT(CASE WHEN ssa.status = 'main_gm' THEN 1 END) as メインGM
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE 'gm' = ANY(s.role)
GROUP BY s.name
ORDER BY s.name;
```

### シナリオごとのGM可能なスタッフ

```sql
SELECT 
  sc.title as シナリオ名,
  STRING_AGG(
    CASE 
      WHEN ssa.status = 'main_gm' THEN s.name || '★'
      ELSE s.name
    END, 
    ', ' 
    ORDER BY ssa.status DESC, s.name
  ) as GM可能なスタッフ
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
LEFT JOIN staff s ON ssa.staff_id = s.id
WHERE ssa.status IN ('can_gm', 'main_gm')
GROUP BY sc.title
ORDER BY sc.title;
```

### 特定のシナリオをGMできるスタッフを検索

```sql
SELECT 
  s.name as スタッフ名,
  ssa.status as 習熟度,
  ssa.can_gm_at as GM可能日,
  ssa.notes as 備考
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE 
  sc.title = 'グロリアメモリーズ'
  AND ssa.status IN ('can_gm', 'main_gm')
ORDER BY ssa.status DESC, s.name;
```

## データ移行

既存の`available_scenarios`配列からリレーショナルテーブルへの移行:

```sql
-- 既存データの移行（available_scenarios → staff_scenario_assignments）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, status, can_gm_at)
SELECT 
  s.id,
  sc.id,
  'can_gm',
  NOW()
FROM staff s
CROSS JOIN LATERAL unnest(s.available_scenarios) AS scenario_name
INNER JOIN scenarios sc ON sc.title = scenario_name
ON CONFLICT (staff_id, scenario_id) 
DO UPDATE SET status = 'can_gm', can_gm_at = NOW();
```

## 次のステップ

1. `enhance_staff_scenario_assignments.sql` を実行してテーブルを拡張
2. GMリストデータを一括インポート
3. フロントエンドでの表示・編集機能を実装

