# 担当GM表示のトラブルシューティング

## 問題

シナリオ一覧の「担当GM」欄に表示されているスタッフが、実際には体験済みだけのメンバーである。

## 原因の調査

### ステップ1: 現状確認

```sql
-- database/check_gm_assignments_status.sql をSupabaseで実行
```

このSQLで以下を確認：
- `can_main_gm`, `can_sub_gm`, `is_experienced` カラムが存在するか
- データが正しく設定されているか
- NULLやfalseのみのレコードがないか

### ステップ2: 問題パターンの特定

#### パターンA: カラムが存在しない

**症状:**
- `can_main_gm`, `can_sub_gm`, `is_experienced` カラムがない

**解決:**
```sql
-- database/redesign_gm_system_v3.sql を実行
```

#### パターンB: カラムは存在するが全てNULL

**症状:**
- カラムは存在するが、全レコードでNULL

**解決:**
```sql
-- database/fix_gm_assignments_data.sql を実行（オプション1）
```

#### パターンC: カラムは存在するが全てfalse

**症状:**
- `can_main_gm = false`, `can_sub_gm = false`, `is_experienced = false`

**解決:**
```sql
-- 古いデータを削除して新しいデータをインポート
DELETE FROM staff_scenario_assignments;

-- その後、GMアサインメントをインポート
-- database/import_all_gm_assignments.sql (パート1)
-- database/import_all_gm_assignments_part2.sql
-- ... (パート6まで)
```

#### パターンD: 旧システムのデータが入っている

**症状:**
- `can_main_gm`, `can_sub_gm` カラムがなく、レコードだけ存在する

**解決:**
1. カラムを追加
2. データを全削除
3. 新しいデータをインポート

## 解決手順（推奨）

### 方法1: クリーンインストール（推奨）

全データを削除して、正しいデータをインポートし直す：

```sql
-- 1. GMシステムのテーブル拡張
-- database/redesign_gm_system_v3.sql

-- 2. 古いデータを削除
DELETE FROM staff_scenario_assignments;

-- 3. 新しいGMアサインメントをインポート
-- database/import_all_gm_assignments.sql
-- database/import_all_gm_assignments_part2.sql
-- database/import_all_gm_assignments_part3.sql
-- database/import_all_gm_assignments_part4.sql
-- database/import_all_gm_assignments_part5.sql
-- database/import_all_gm_assignments_part6.sql

-- 4. 確認
SELECT 
  sc.title,
  COUNT(*) FILTER (WHERE ssa.can_main_gm = true OR ssa.can_sub_gm = true) as GM可能人数
FROM scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON sc.id = ssa.scenario_id
GROUP BY sc.title
HAVING COUNT(*) FILTER (WHERE ssa.can_main_gm = true OR ssa.can_sub_gm = true) > 0
LIMIT 10;
```

### 方法2: 既存データを修正

NULLをfalseに設定してから、必要なレコードだけ更新：

```sql
-- database/fix_gm_assignments_data.sql を実行
```

## フロントエンドの修正

`src/lib/assignmentApi.ts` を修正済み：

```typescript
// GM可能なスタッフのみ取得
.or('can_main_gm.eq.true,can_sub_gm.eq.true')
```

これにより、以下のフィルタリングが適用されます：

| 状態 | 担当GMとして表示 |
|------|---------------|
| can_main_gm = true | ✅ 表示 |
| can_sub_gm = true | ✅ 表示 |
| is_experienced = true のみ | ❌ 非表示 |
| 全てfalse | ❌ 非表示 |

## 確認方法

### データベース側

```sql
-- GM可能なスタッフがいるシナリオ
SELECT 
  sc.title,
  STRING_AGG(s.name, ', ') as GM可能スタッフ
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
GROUP BY sc.title
LIMIT 10;
```

### フロントエンド側

1. ブラウザのキャッシュをクリア
2. シナリオ管理ページをリロード
3. 担当GM欄を確認

## 次のステップ

1. `check_gm_assignments_status.sql` を実行して現状を確認
2. 問題パターンを特定
3. 適切な解決方法を選択して実行
4. フロントエンドでリロードして確認

