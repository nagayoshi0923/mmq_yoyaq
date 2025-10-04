-- スタッフテーブルにuser_idカラムを追加してauth.usersと紐付け
ALTER TABLE staff ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- emailに基づいてuser_idを更新（既存データの場合）
-- UPDATE staff
-- SET user_id = (SELECT id FROM auth.users WHERE auth.users.email = staff.email)
-- WHERE email IS NOT NULL;

-- user_idにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
