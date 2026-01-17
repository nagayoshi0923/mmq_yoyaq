-- 顧客テーブルにアバター画像URLカラムを追加
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- コメント
COMMENT ON COLUMN customers.avatar_url IS '顧客のアバター画像URL（Supabase Storage）';

