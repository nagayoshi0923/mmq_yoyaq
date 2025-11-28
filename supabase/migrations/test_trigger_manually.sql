-- ========================================
-- トリガーのロジックを手動で実行してテスト
-- ========================================

DO $$
DECLARE
  v_user_id UUID := '81915a01-a52c-4b67-b46a-53e36930e76b';
  v_email TEXT := 'mai.mine0202@gmail.com';
  v_invited_as TEXT;
  v_role app_role;  -- ENUM型に変更
BEGIN
  -- 1. raw_user_meta_data を更新
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
    'invited_as', 'staff',
    'email_verified', true
  )
  WHERE id = v_user_id;
  
  RAISE NOTICE '✅ raw_user_meta_data を更新しました';
  
  -- 2. トリガーのロジックを再現
  SELECT raw_user_meta_data->>'invited_as' 
  INTO v_invited_as
  FROM auth.users
  WHERE id = v_user_id;
  
  RAISE NOTICE '📧 メール: %', v_email;
  RAISE NOTICE '🎭 invited_as: %', COALESCE(v_invited_as, 'null');
  
  -- 3. role を決定（ENUM型にキャスト）
  v_role := CASE 
    WHEN v_invited_as = 'staff' THEN 'staff'::app_role
    ELSE 'customer'::app_role
  END;
  
  RAISE NOTICE '✅ ロールを設定: %', v_role;
  
  -- 4. public.users を更新
  UPDATE public.users
  SET role = v_role
  WHERE id = v_user_id;
  
  RAISE NOTICE '🎉 public.users を更新しました';
  
END $$;

-- 確認
SELECT 
  id, 
  email, 
  role,
  created_at
FROM public.users
WHERE email = 'mai.mine0202@gmail.com';

-- auth.users も確認
SELECT 
  id,
  email,
  raw_user_meta_data,
  raw_user_meta_data->>'invited_as' as invited_as
FROM auth.users
WHERE email = 'mai.mine0202@gmail.com';

