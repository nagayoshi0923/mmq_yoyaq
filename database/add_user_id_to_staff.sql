-- staffテーブルにuser_idカラムを追加
-- ユーザーアカウントとスタッフを紐づけるためのカラム

-- user_idカラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff' 
        AND column_name = 'user_id'
    ) THEN
        -- user_idカラムを追加（auth.usersへの外部キー）
        ALTER TABLE staff 
        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        
        -- コメントを追加
        COMMENT ON COLUMN staff.user_id IS 'ログイン可能なユーザーアカウントID（auth.users）';
        
        -- インデックスを追加（検索の高速化）
        CREATE INDEX idx_staff_user_id ON staff(user_id);
        
        RAISE NOTICE 'user_idカラムを追加しました';
    ELSE
        RAISE NOTICE 'user_idカラムは既に存在します';
    END IF;
END $$;

-- UNIQUE制約を追加（1つのユーザーアカウントは1つのスタッフにのみ紐づけ可能）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'staff_user_id_unique' 
        AND conrelid = 'staff'::regclass
    ) THEN
        ALTER TABLE staff 
        ADD CONSTRAINT staff_user_id_unique UNIQUE (user_id);
        
        RAISE NOTICE 'user_idにUNIQUE制約を追加しました';
    ELSE
        RAISE NOTICE 'user_idのUNIQUE制約は既に存在します';
    END IF;
END $$;

-- カラムとインデックスの確認
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'staff' AND column_name = 'user_id';

SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'staff' AND indexname LIKE '%user_id%';

-- 制約の確認
SELECT
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'staff'::regclass
  AND conname LIKE '%user_id%';

