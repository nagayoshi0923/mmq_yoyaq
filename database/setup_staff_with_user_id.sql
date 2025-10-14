-- スタッフテーブルのセットアップ（user_id追加とデータ作成）

-- 1. スタッフテーブルを作成（存在しない場合）
CREATE TABLE IF NOT EXISTS staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  line_name TEXT,
  x_account TEXT,
  role TEXT[] DEFAULT '{}',
  stores TEXT[] DEFAULT '{}',
  ng_days TEXT[] DEFAULT '{}',
  want_to_learn TEXT[] DEFAULT '{}',
  available_scenarios TEXT[] DEFAULT '{}',
  notes TEXT,
  phone TEXT,
  email TEXT,
  availability TEXT[] DEFAULT '{}',
  experience INTEGER DEFAULT 0,
  special_scenarios TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. user_idカラムを追加（存在しない場合）
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. user_idにインデックスを追加（高速化）
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);

-- 4. 現在のユーザー（mai.nagayoshi@gmail.com）用のスタッフデータを作成
INSERT INTO staff (
  name, 
  email, 
  user_id, 
  role, 
  stores, 
  experience, 
  status,
  notes
) VALUES (
  '永吉舞',
  'mai.nagayoshi@gmail.com',
  (SELECT id FROM auth.users WHERE email = 'mai.nagayoshi@gmail.com'),
  ARRAY['admin', 'gm'],
  ARRAY['高田馬場店'],
  5,
  'active',
  'システム管理者・メインGM'
) ON CONFLICT (user_id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  stores = EXCLUDED.stores,
  experience = EXCLUDED.experience,
  notes = EXCLUDED.notes;

-- 5. 確認クエリ
SELECT 
  s.name,
  s.email,
  s.user_id,
  u.email as auth_email,
  s.role,
  s.status
FROM staff s
LEFT JOIN auth.users u ON s.user_id = u.id
WHERE s.email = 'mai.nagayoshi@gmail.com';
