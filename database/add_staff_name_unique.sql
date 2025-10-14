-- staffテーブルのnameカラムにUNIQUE制約を追加
-- これにより、同じ名前のスタッフを重複して登録できなくなります

-- 既存の重複データがある場合は、まず重複を解消する必要があります
-- 重複チェック
SELECT 
  name, 
  COUNT(*) as count
FROM staff
GROUP BY name
HAVING COUNT(*) > 1;

-- 重複がある場合は、以下のクエリで重複データを確認してから手動で削除してください
-- SELECT id, name, line_name, created_at 
-- FROM staff 
-- WHERE name IN (
--   SELECT name FROM staff GROUP BY name HAVING COUNT(*) > 1
-- )
-- ORDER BY name, created_at;

-- UNIQUE制約を追加
DO $$ 
BEGIN
    -- 既に制約が存在するかチェック
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'staff_name_unique' 
        AND conrelid = 'staff'::regclass
    ) THEN
        -- UNIQUE制約を追加
        ALTER TABLE staff 
        ADD CONSTRAINT staff_name_unique UNIQUE (name);
        
        RAISE NOTICE 'UNIQUE制約 staff_name_unique を追加しました';
    ELSE
        RAISE NOTICE 'UNIQUE制約 staff_name_unique は既に存在します';
    END IF;
END $$;

-- インデックスの確認（UNIQUE制約により自動的に作成されます）
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'staff' AND indexdef LIKE '%name%';

-- 制約の確認
SELECT
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'staff'::regclass
  AND conname LIKE '%name%';

