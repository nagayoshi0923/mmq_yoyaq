-- ========================================
-- 既存のスタッフ招待ユーザーのロールを修正
-- ========================================
-- 問題: 過去にスタッフ招待されたユーザーで、roleが'customer'になっているものを修正

-- staffテーブルにuser_idが設定されているユーザーは、usersテーブルのroleを'staff'に更新
UPDATE public.users u
SET 
  role = 'staff'::app_role,
  updated_at = NOW()
WHERE 
  u.role = 'customer'::app_role
  AND EXISTS (
    SELECT 1 
    FROM public.staff s 
    WHERE s.user_id = u.id
  );

-- auth.usersでinvited_as='staff'が設定されているユーザーも修正
UPDATE public.users u
SET 
  role = 'staff'::app_role,
  updated_at = NOW()
WHERE 
  u.role = 'customer'::app_role
  AND EXISTS (
    SELECT 1 
    FROM auth.users au
    WHERE au.id = u.id
    AND au.raw_user_meta_data->>'invited_as' = 'staff'
  );

-- 確認クエリ
SELECT 
  '修正結果' AS info,
  COUNT(*) FILTER (WHERE u.role = 'staff' AND s.user_id IS NOT NULL) AS staff_users_fixed,
  COUNT(*) FILTER (WHERE u.role = 'customer' AND s.user_id IS NOT NULL) AS remaining_customer_staff
FROM public.users u
LEFT JOIN public.staff s ON s.user_id = u.id;
