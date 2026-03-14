-- ユーザーの表示名を取得するRPC関数
-- private_group_membersからuser_idでusersテーブルの表示名を取得

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
    COALESCE(u.display_name, u.nickname, split_part(u.email, '@', 1)) as display_name
  FROM users u
  WHERE u.id = ANY(user_ids);
END;
$$;

-- 権限を付与
GRANT EXECUTE ON FUNCTION get_user_display_names(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_display_names(UUID[]) TO anon;

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ get_user_display_names RPC関数を作成しました';
END $$;
