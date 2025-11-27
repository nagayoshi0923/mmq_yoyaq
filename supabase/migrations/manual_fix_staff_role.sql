-- ========================================
-- 暫定対策：招待したスタッフを手動でstaffに変更
-- ========================================

-- 1. invited_asがstaffの全ユーザーをstaffに変更
UPDATE public.users
SET 
  role = 'staff'::app_role,
  updated_at = NOW()
FROM auth.users au
WHERE public.users.id = au.id
  AND au.raw_user_meta_data->>'invited_as' = 'staff'
  AND public.users.role != 'staff'::app_role;

-- 2. 結果を確認
SELECT 
  '【修正結果】' as section,
  COUNT(*) || ' 件のユーザーをstaffに変更しました' as message
FROM public.users
WHERE role = 'staff'::app_role;

-- 3. 全スタッフを表示
SELECT 
  '【全スタッフ一覧】' as section,
  au.email,
  u.role,
  au.raw_user_meta_data->>'invited_as' as invited_as,
  u.updated_at
FROM auth.users au
JOIN public.users u ON au.id = u.id
WHERE u.role = 'staff'::app_role
ORDER BY u.updated_at DESC;

