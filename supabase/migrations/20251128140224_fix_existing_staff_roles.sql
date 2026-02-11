-- ========================================
-- 既存のスタッフ招待ユーザーのロールを修正
-- ========================================
-- 問題: 過去にスタッフ招待されたユーザーで、roleが'customer'になっているものを修正
-- 注意: staff テーブルが存在しない環境（新規セットアップ）ではスキップ

DO $$
BEGIN
  -- staff テーブルが存在し、user_id カラムがある場合のみ実行
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'user_id'
  ) THEN
    -- staffテーブルにuser_idが設定されているユーザーは、usersテーブルのroleを'staff'に更新
    UPDATE public.users u
    SET role = 'staff'::app_role, updated_at = NOW()
    WHERE u.role = 'customer'::app_role
      AND EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = u.id);

    -- auth.usersでinvited_as='staff'が設定されているユーザーも修正
    UPDATE public.users u
    SET role = 'staff'::app_role, updated_at = NOW()
    WHERE u.role = 'customer'::app_role
      AND EXISTS (
        SELECT 1 FROM auth.users au
        WHERE au.id = u.id AND au.raw_user_meta_data->>'invited_as' = 'staff'
      );

    RAISE NOTICE '既存スタッフ招待ユーザーのロールを修正しました';
  ELSE
    RAISE NOTICE 'staff テーブルが存在しないため、ロール修正をスキップしました';
  END IF;
END $$;
