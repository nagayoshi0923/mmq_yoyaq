-- ========================================
-- テスト用：既存ユーザーを削除してトリガーをテスト
-- ========================================
-- このSQLは、既存の auth.users ユーザーを削除し、
-- 再度招待することでトリガーをテストするためのものです。

-- 1. 削除するユーザーの情報を確認
SELECT 
  '【削除前確認】' as section,
  'auth.users' as table_name,
  id,
  email,
  created_at,
  raw_user_meta_data->>'invited_as' as invited_as
FROM auth.users
WHERE email = 'mai.mine0202@gmail.com';

-- 2. public.users にも存在するか確認
SELECT 
  '【public.users確認】' as section,
  id,
  email,
  role,
  created_at
FROM public.users
WHERE email = 'mai.mine0202@gmail.com';

-- 3. まず auth.users から削除（これが最も確実）
-- ⚠️ これを実行すると、関連する全てのデータが削除されます
DO $$
DECLARE
  user_id UUID;
BEGIN
  -- ユーザーIDを取得
  SELECT id INTO user_id FROM auth.users WHERE email = 'mai.mine0202@gmail.com';
  
  IF user_id IS NOT NULL THEN
    -- auth.users から削除
    DELETE FROM auth.users WHERE id = user_id;
    RAISE NOTICE '✅ auth.users から削除しました (ID: %)', user_id;
  ELSE
    RAISE NOTICE '⚠️ ユーザーが見つかりませんでした';
  END IF;
END $$;

-- 4. 削除されたか確認
SELECT 
  '【削除後確認】' as section,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ auth.users から削除されました'
    ELSE '❌ まだ存在します'
  END as status
FROM auth.users
WHERE email = 'mai.mine0202@gmail.com';

-- 5. public.users からも削除されたか確認（CASCADE設定による）
SELECT 
  '【public.users削除確認】' as section,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ public.users からも削除されました'
    ELSE '❌ まだ存在します'
  END as status
FROM public.users
WHERE email = 'mai.mine0202@gmail.com';

-- 6. 次のステップ
SELECT 
  '【次のステップ】' as section,
  '1. このSQLを実行して削除を完了' as step1,
  '2. スタッフ管理画面で mai.mine0202@gmail.com を再度招待' as step2,
  '3. Postgres Logs で 🔵 トリガー発火 メッセージを確認' as step3;




-- ========================================
-- このSQLは、既存の auth.users ユーザーを削除し、
-- 再度招待することでトリガーをテストするためのものです。

-- 1. 削除するユーザーの情報を確認
SELECT 
  '【削除前確認】' as section,
  'auth.users' as table_name,
  id,
  email,
  created_at,
  raw_user_meta_data->>'invited_as' as invited_as
FROM auth.users
WHERE email = 'mai.mine0202@gmail.com';

-- 2. public.users にも存在するか確認
SELECT 
  '【public.users確認】' as section,
  id,
  email,
  role,
  created_at
FROM public.users
WHERE email = 'mai.mine0202@gmail.com';

-- 3. まず auth.users から削除（これが最も確実）
-- ⚠️ これを実行すると、関連する全てのデータが削除されます
DO $$
DECLARE
  user_id UUID;
BEGIN
  -- ユーザーIDを取得
  SELECT id INTO user_id FROM auth.users WHERE email = 'mai.mine0202@gmail.com';
  
  IF user_id IS NOT NULL THEN
    -- auth.users から削除
    DELETE FROM auth.users WHERE id = user_id;
    RAISE NOTICE '✅ auth.users から削除しました (ID: %)', user_id;
  ELSE
    RAISE NOTICE '⚠️ ユーザーが見つかりませんでした';
  END IF;
END $$;

-- 4. 削除されたか確認
SELECT 
  '【削除後確認】' as section,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ auth.users から削除されました'
    ELSE '❌ まだ存在します'
  END as status
FROM auth.users
WHERE email = 'mai.mine0202@gmail.com';

-- 5. public.users からも削除されたか確認（CASCADE設定による）
SELECT 
  '【public.users削除確認】' as section,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ public.users からも削除されました'
    ELSE '❌ まだ存在します'
  END as status
FROM public.users
WHERE email = 'mai.mine0202@gmail.com';

-- 6. 次のステップ
SELECT 
  '【次のステップ】' as section,
  '1. このSQLを実行して削除を完了' as step1,
  '2. スタッフ管理画面で mai.mine0202@gmail.com を再度招待' as step2,
  '3. Postgres Logs で 🔵 トリガー発火 メッセージを確認' as step3;



