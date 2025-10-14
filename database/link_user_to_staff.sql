-- ユーザーアカウントとスタッフを紐づけるSQL
-- 
-- ユーザー情報:
-- email: mai.nagayoshi@gmail.com
-- user_id: 472c8556-f296-4a76-bb8d-f4010156cb6f
-- 
-- スタッフID: 422c7438-a84e-4b60-8d90-0b6ee35b61b1

-- ステップ1: staffテーブルにuser_idカラムを追加（存在しない場合）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff' 
        AND column_name = 'user_id'
    ) THEN
        ALTER TABLE staff 
        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'user_idカラムを追加しました';
    ELSE
        RAISE NOTICE 'user_idカラムは既に存在します';
    END IF;
END $$;

-- ステップ2: スタッフにユーザーIDを紐づける
UPDATE staff
SET 
  user_id = '472c8556-f296-4a76-bb8d-f4010156cb6f',
  updated_at = NOW()
WHERE id = '422c7438-a84e-4b60-8d90-0b6ee35b61b1';

-- ステップ3: ユーザーをadminに設定（既にadminですが念のため）
UPDATE users
SET 
  role = 'admin',
  updated_at = NOW()
WHERE id = '472c8556-f296-4a76-bb8d-f4010156cb6f';

-- 確認
SELECT 
  '✅ 紐づけが完了しました' as status;

-- 紐づけ結果の確認
SELECT 
  s.id as staff_id,
  s.name as スタッフ名,
  s.line_name as LINE名,
  u.id as user_id,
  u.email as メールアドレス,
  u.role as 権限,
  array_to_string(s.role, ', ') as スタッフ役割
FROM staff s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.id = '422c7438-a84e-4b60-8d90-0b6ee35b61b1';

-- 他の紐づけ状況も確認
SELECT 
  s.name as スタッフ名,
  s.line_name as LINE名,
  u.email as メールアドレス,
  u.role as 権限,
  CASE 
    WHEN s.user_id IS NULL THEN '未紐づけ'
    ELSE '紐づけ済み'
  END as 紐づけ状態
FROM staff s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY 
  CASE WHEN s.user_id IS NULL THEN 1 ELSE 0 END,
  s.name;

