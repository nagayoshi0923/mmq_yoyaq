# GMシステム設計書

## 習熟度の明確な定義

**重要な前提: GMができる状態 = 必ずプレイヤーとして体験済み**

### 1. 未体験
- まだ遊んだことがない
- レコード自体が存在しない
- メインGM: ❌
- サブGM: ❌

### 2. 体験済み (is_experienced = true)
- **プレイヤーとして遊んだことがある**
- **GMは一切できない**
- メインGM: ❌
- サブGM: ❌
- 設定: `can_main_gm = false, can_sub_gm = false, is_experienced = true`

### 3. サブGMのみ可能
- **プレイヤーとして遊んだことがある（体験済み前提）**
- サブGMはできるが、メインGMはできない
- メインGM: ❌
- サブGM: ✅
- 設定: `can_main_gm = false, can_sub_gm = true, is_experienced = false`

### 4. メインGMのみ可能
- **プレイヤーとして遊んだことがある（体験済み前提）**
- メインGMはできるが、サブGMはできない（特殊ケース）
- メインGM: ✅
- サブGM: ❌
- 設定: `can_main_gm = true, can_sub_gm = false, is_experienced = false`

### 5. メイン・サブ両方可能
- **プレイヤーとして遊んだことがある（体験済み前提）**
- 最も柔軟
- メインGM: ✅
- サブGM: ✅
- 設定: `can_main_gm = true, can_sub_gm = true, is_experienced = false`

## データベーススキーマ

### scenariosテーブルに追加

| カラム名 | 型 | デフォルト | 説明 |
|---------|---|----------|------|
| requires_sub_gm | BOOLEAN | false | サブGMが必要か |
| gm_count_required | INTEGER | 1 | 必要なGM人数 |

### staff_scenario_assignmentsテーブルに追加

| カラム名 | 型 | デフォルト | 説明 |
|---------|---|----------|------|
| can_main_gm | BOOLEAN | false | メインGMができるか（**体験済み前提**） |
| can_sub_gm | BOOLEAN | false | サブGMができるか（**体験済み前提**） |
| is_experienced | BOOLEAN | false | 体験済みだがGMは一切できない |
| experienced_at | TIMESTAMPTZ | NULL | 体験日 |
| can_gm_at | TIMESTAMPTZ | NULL | GM可能になった日 |
| notes | TEXT | NULL | 備考（既存） |

### ロジックルール

**重要:**
- `can_main_gm = true` または `can_sub_gm = true` → **必ず体験済み**
- `is_experienced = true` → `can_main_gm = false` かつ `can_sub_gm = false`
- GMができる人に`is_experienced`フラグは使わない（冗長になるため）

## パターン別の設定

### パターン1: 通常のシナリオ（GM1人）

**グロリアメモリーズ**

| スタッフ | can_main_gm | can_sub_gm | is_experienced | 説明 |
|---------|------------|-----------|---------------|------|
| きゅう | true | false | false | メインGMができる |
| れみあ | true | false | false | メインGMができる |

### パターン2: 2人GM必要なシナリオ

**モノクローム**

| スタッフ | can_main_gm | can_sub_gm | is_experienced | 説明 |
|---------|------------|-----------|---------------|------|
| りえぞー | true | true | false | メイン・サブ両方可能 |
| しらやま | true | true | false | メイン・サブ両方可能 |
| えりん | true | false | false | メインのみ可能 |
| 崎 | true | false | false | メインのみ可能 |
| じの | true | false | false | メインのみ可能 |
| みずき | false | true | false | サブのみ可能 |
| きゅう | false | true | false | サブのみ可能 |
| labo | false | true | false | サブのみ可能 |
| モリシ | false | true | false | サブのみ可能 |

### パターン3: 体験済み（GMできない）

| スタッフ | can_main_gm | can_sub_gm | is_experienced | 説明 |
|---------|------------|-----------|---------------|------|
| さく | false | false | true | プレイヤー体験のみ |

## データ登録SQL

### シナリオの設定

```sql
-- 通常シナリオ（GM1人）
UPDATE scenarios
SET 
  requires_sub_gm = false,
  gm_count_required = 1
WHERE title = 'グロリアメモリーズ';

-- 2人GM必要なシナリオ
UPDATE scenarios
SET 
  requires_sub_gm = true,
  gm_count_required = 2
WHERE title = 'モノクローム';
```

### スタッフとシナリオの紐づけ

```sql
-- メイン・サブ両方可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'りえぞー'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  true
);

-- メインのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'えりん'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  false
);

-- サブのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'みずき'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  false,
  true
);

-- 体験済み（GMできない）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, is_experienced, experienced_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'さく'),
  (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
  true,
  NOW()
);
```

## クエリ例

### 1. シナリオごとのGM可能スタッフを検索

```sql
SELECT 
  sc.title as シナリオ名,
  sc.requires_sub_gm as サブGM必要,
  STRING_AGG(
    CASE 
      WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN s.name || '（メイン・サブ両方）'
      WHEN ssa.can_main_gm AND NOT ssa.can_sub_gm THEN s.name || '（メインのみ）'
      WHEN NOT ssa.can_main_gm AND ssa.can_sub_gm THEN s.name || '（サブのみ）'
    END,
    ', '
    ORDER BY ssa.can_main_gm DESC, s.name
  ) FILTER (WHERE ssa.can_main_gm OR ssa.can_sub_gm) as GM可能スタッフ
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
LEFT JOIN staff s ON ssa.staff_id = s.id
WHERE sc.title = 'モノクローム'
GROUP BY sc.title, sc.requires_sub_gm;
```

### 2. スタッフの習熟度サマリー

```sql
SELECT 
  s.name as スタッフ名,
  COUNT(CASE WHEN ssa.is_experienced AND NOT ssa.can_main_gm AND NOT ssa.can_sub_gm THEN 1 END) as 体験済み,
  COUNT(CASE WHEN NOT ssa.can_main_gm AND ssa.can_sub_gm THEN 1 END) as サブGMのみ,
  COUNT(CASE WHEN ssa.can_main_gm THEN 1 END) as メインGM可能,
  COUNT(CASE WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN 1 END) as メインサブ両方
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE 'gm' = ANY(s.role)
GROUP BY s.name
ORDER BY s.name;
```

### 3. 特定シナリオのGMアサイン候補

```sql
-- モノクロームのメインGM候補
SELECT 
  s.name as スタッフ名,
  CASE 
    WHEN ssa.can_sub_gm THEN 'サブGMも可能'
    ELSE 'メインのみ'
  END as 備考,
  array_to_string(s.ng_days, ', ') as NG曜日
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'モノクローム' AND ssa.can_main_gm = true
ORDER BY ssa.can_sub_gm DESC, s.name;

-- モノクロームのサブGM候補（メインができない人）
SELECT 
  s.name as スタッフ名,
  array_to_string(s.ng_days, ', ') as NG曜日
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'モノクローム' 
  AND ssa.can_sub_gm = true 
  AND NOT ssa.can_main_gm
ORDER BY s.name;
```

### 4. 習熟度の進捗管理

```sql
-- プレイヤーとして体験した
UPDATE staff_scenario_assignments
SET 
  is_experienced = true,
  experienced_at = NOW()
WHERE staff_id = (SELECT id FROM staff WHERE name = 'きゅう')
  AND scenario_id = (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ');

-- GMができるようになった
UPDATE staff_scenario_assignments
SET 
  can_main_gm = true,
  can_gm_at = NOW(),
  is_experienced = false
WHERE staff_id = (SELECT id FROM staff WHERE name = 'きゅう')
  AND scenario_id = (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ');
```

## まとめ

### データ構造の利点

| 状態 | can_main_gm | can_sub_gm | is_experienced | 用途 |
|------|------------|-----------|---------------|------|
| 体験済み | false | false | true | プレイヤー体験のみ |
| サブのみ | false | true | false | サブGM専門 |
| メインのみ | true | false | false | メインGM専門（特殊） |
| 両方可能 | true | true | false | 最も柔軟 |

### クエリの柔軟性

- メインGM候補: `WHERE can_main_gm = true`
- サブGM候補: `WHERE can_sub_gm = true`
- 体験者: `WHERE is_experienced = true`
- 組み合わせ検索も容易

この設計により、提供いただいたGMリストデータを正確に管理できます！
*/

