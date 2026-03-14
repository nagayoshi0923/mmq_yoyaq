-- usersテーブルにdisplay_nameカラムを追加し、RPC関数を修正

-- 1. usersテーブルにdisplay_nameカラムを追加
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. RPC関数を修正（display_nameとemailのみを使用）
CREATE OR REPLACE FUNCTION get_user_display_names(user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    COALESCE(u.display_name, split_part(u.email, '@', 1)) as display_name
  FROM users u
  WHERE u.id = ANY(user_ids);
END;
$$;

-- 権限を付与
GRANT EXECUTE ON FUNCTION get_user_display_names(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_display_names(UUID[]) TO anon;

-- 既存ユーザーのdisplay_nameをemailから自動設定（まだ設定されていない場合）
UPDATE public.users
SET display_name = split_part(email, '@', 1)
WHERE display_name IS NULL;

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ usersテーブルにdisplay_nameカラムを追加し、RPC関数を修正しました';
END $$;
