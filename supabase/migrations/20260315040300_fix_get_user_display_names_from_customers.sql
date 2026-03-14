-- RPC関数を修正: customersテーブルからニックネームを取得

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
    COALESCE(c.nickname, c.name, u.display_name, split_part(u.email, '@', 1)) as display_name
  FROM users u
  LEFT JOIN customers c ON c.user_id = u.id
  WHERE u.id = ANY(user_ids);
END;
$$;

-- 既存のprivate_group_membersのguest_nameを修正（customersテーブルからニックネームを取得）
UPDATE public.private_group_members pgm
SET guest_name = COALESCE(c.nickname, c.name, split_part(u.email, '@', 1))
FROM public.users u
LEFT JOIN public.customers c ON c.user_id = u.id
WHERE pgm.user_id = u.id
  AND (pgm.guest_name IS NULL OR pgm.guest_name = '');

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ RPC関数をcustomersテーブル参照に修正し、既存メンバーのguest_nameを更新しました';
END $$;
