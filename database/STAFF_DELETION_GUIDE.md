# スタッフ削除ガイド

スタッフを安全に削除するための手順とSQLファイルの説明です。

## ⚠️ 重要な注意事項

スタッフを削除する前に、以下の関連データも削除する必要があります：

| テーブル名 | 説明 | 制約 |
|-----------|------|------|
| shift_submissions | シフト提出データ | 外部キー制約あり |
| staff_scenario_assignments | スタッフとシナリオの紐づけ | 外部キー制約あり |
| gm_availability | GMの空き状況 | 外部キー制約あり（存在する場合） |

## 削除方法

### 方法1: 特定のスタッフを削除

**ファイル:** `database/delete_staff_safely.sql`

**手順:**
1. SQLファイルを開く
2. `'削除したいスタッフ名'` を実際のスタッフ名に置換
3. Supabaseで実行

**例:**
```sql
-- 田中太郎を削除する場合
WHERE name = '田中太郎'
```

### 方法2: サンプルスタッフを全て削除

**ファイル:** `database/delete_all_sample_staff.sql`

**対象:**
- 田中太郎
- 佐藤花子
- 鈴木一郎
- 高橋美咲
- その他、名前にこれらが含まれるスタッフ

**手順:**
1. そのまま実行（変更不要）

### 方法3: 退職済みスタッフを削除

**ファイル:** `database/delete_inactive_staff.sql`

**対象:**
- `status = 'inactive'` のスタッフ全員

**手順:**
1. そのまま実行（変更不要）

### 方法4: 特定のスタッフを置き換え

**ファイル:** `database/replace_tanaka_with_eikichi.sql`

**対象:**
- 田中太郎を削除
- えいきちに置き換え

## 削除の流れ

```
1. 削除対象を確認
   ↓
2. 関連データを確認
   ↓
3. shift_submissions を削除
   ↓
4. staff_scenario_assignments を削除
   ↓
5. gm_availability を削除
   ↓
6. staff本体を削除
   ↓
7. 削除結果を確認
```

## 安全な削除手順

### ステップ1: バックアップ（推奨）

```sql
-- スタッフデータのバックアップ（CSV形式でエクスポート）
COPY (
  SELECT * FROM staff 
  WHERE name = '削除したいスタッフ名'
) TO '/tmp/staff_backup.csv' WITH CSV HEADER;

-- 関連データのバックアップ
COPY (
  SELECT * FROM staff_scenario_assignments 
  WHERE staff_id IN (SELECT id FROM staff WHERE name = '削除したいスタッフ名')
) TO '/tmp/staff_scenario_assignments_backup.csv' WITH CSV HEADER;
```

### ステップ2: 削除前の確認

```sql
-- 削除対象のスタッフを確認
SELECT * FROM staff WHERE name = '削除したいスタッフ名';

-- 関連データの数を確認
SELECT 
  (SELECT COUNT(*) FROM shift_submissions WHERE staff_id = (SELECT id FROM staff WHERE name = 'スタッフ名')) as shift_count,
  (SELECT COUNT(*) FROM staff_scenario_assignments WHERE staff_id = (SELECT id FROM staff WHERE name = 'スタッフ名')) as assignment_count;
```

### ステップ3: 削除実行

適切なSQLファイルを選んで実行してください。

### ステップ4: 削除後の確認

```sql
-- スタッフが削除されたことを確認
SELECT COUNT(*) FROM staff WHERE name = '削除したいスタッフ名';
-- 結果: 0 であればOK

-- 残りのスタッフ数を確認
SELECT COUNT(*) FROM staff;
```

## よくある削除パターン

### パターン1: サンプルデータの削除

初期データに含まれるサンプルスタッフを削除：

```sql
-- database/delete_all_sample_staff.sql を実行
```

### パターン2: 退職したスタッフの削除

まず退職済みに変更してから削除：

```sql
-- 退職済みに変更
UPDATE staff SET status = 'inactive' WHERE name = 'スタッフ名';

-- 削除
-- database/delete_inactive_staff.sql を実行
```

### パターン3: 複数のスタッフを一括削除

```sql
DELETE FROM shift_submissions
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE name IN ('スタッフA', 'スタッフB', 'スタッフC')
);

DELETE FROM staff_scenario_assignments
WHERE staff_id IN (
  SELECT id FROM staff 
  WHERE name IN ('スタッフA', 'スタッフB', 'スタッフC')
);

DELETE FROM staff
WHERE name IN ('スタッフA', 'スタッフB', 'スタッフC');
```

## トラブルシューティング

### エラー: violates foreign key constraint

**原因:** 関連データを先に削除していません。

**解決:** 関連データを削除してから、スタッフ本体を削除してください。

### 削除したスタッフがschedule_eventsに残っている

**問題:** `schedule_events.gms` 配列にスタッフ名が文字列として含まれている場合、
外部キー制約がないため自動削除されません。

**解決:**
```sql
-- 特定のスタッフ名をgms配列から削除
UPDATE schedule_events
SET gms = array_remove(gms, '削除したスタッフ名')
WHERE '削除したスタッフ名' = ANY(gms);
```

### 削除したスタッフがreservationsに残っている

**解決:**
```sql
-- assigned_staff配列から削除
UPDATE reservations
SET assigned_staff = array_remove(assigned_staff, '削除したスタッフ名')
WHERE '削除したスタッフ名' = ANY(assigned_staff);

-- gm_staffフィールドから削除
UPDATE reservations
SET gm_staff = NULL
WHERE gm_staff = '削除したスタッフ名';
```

## 論理削除（推奨）

物理削除の代わりに、ステータスを変更する方法（推奨）：

```sql
-- 退職済みに変更（削除しない）
UPDATE staff
SET 
  status = 'inactive',
  updated_at = NOW()
WHERE name = 'スタッフ名';
```

**メリット:**
- 履歴が残る
- 過去のデータとの整合性が保たれる
- 復元が可能

**デメリット:**
- データベースにデータが残る

