-- scenariosテーブルのtitleカラムにUNIQUE制約を追加
-- これにより、同じタイトルのシナリオを重複して登録できなくなります

-- 既存の重複データがある場合は、まず重複を解消する必要があります
-- 重複チェック
SELECT 
  title, 
  COUNT(*) as count
FROM scenarios
GROUP BY title
HAVING COUNT(*) > 1;

-- 重複がある場合は、以下のクエリで重複データを確認してから手動で削除してください
-- SELECT id, title, author, created_at 
-- FROM scenarios 
-- WHERE title IN (
--   SELECT title FROM scenarios GROUP BY title HAVING COUNT(*) > 1
-- )
-- ORDER BY title, created_at;

-- UNIQUE制約を追加
DO $$ 
BEGIN
    -- 既に制約が存在するかチェック
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'scenarios_title_unique' 
        AND conrelid = 'scenarios'::regclass
    ) THEN
        -- UNIQUE制約を追加
        ALTER TABLE scenarios 
        ADD CONSTRAINT scenarios_title_unique UNIQUE (title);
        
        RAISE NOTICE 'UNIQUE制約 scenarios_title_unique を追加しました';
    ELSE
        RAISE NOTICE 'UNIQUE制約 scenarios_title_unique は既に存在します';
    END IF;
END $$;

-- インデックスの確認（UNIQUE制約により自動的に作成されます）
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'scenarios' AND indexdef LIKE '%title%';

-- 制約の確認
SELECT
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'scenarios'::regclass
  AND conname LIKE '%title%';

