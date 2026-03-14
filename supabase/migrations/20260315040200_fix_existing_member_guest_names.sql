-- 既存のprivate_group_membersのguest_nameを修正
-- user_idがあるがguest_nameがnullのメンバーに、usersテーブルから表示名を設定

UPDATE public.private_group_members pgm
SET guest_name = COALESCE(u.display_name, split_part(u.email, '@', 1))
FROM public.users u
WHERE pgm.user_id = u.id
  AND pgm.guest_name IS NULL;

-- 更新件数を通知
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ %件のメンバーのguest_nameを更新しました', updated_count;
END $$;
