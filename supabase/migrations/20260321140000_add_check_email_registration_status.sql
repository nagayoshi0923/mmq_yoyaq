-- check_email_registration_status: メール登録状態を詳細に返す
-- 返り値:
--   'not_registered' - 未登録
--   'pending_confirmation' - 登録済み・メール未確認
--   'confirmed' - 登録済み・メール確認済み

CREATE OR REPLACE FUNCTION public.check_email_registration_status(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(p_email));
  auth_user RECORD;
BEGIN
  IF needle IS NULL OR needle = '' THEN
    RETURN 'not_registered';
  END IF;

  -- auth.users をチェック
  SELECT id, email_confirmed_at
  INTO auth_user
  FROM auth.users
  WHERE lower(email) = needle
  LIMIT 1;

  IF auth_user.id IS NOT NULL THEN
    IF auth_user.email_confirmed_at IS NOT NULL THEN
      RETURN 'confirmed';
    ELSE
      RETURN 'pending_confirmation';
    END IF;
  END IF;

  -- public.users もチェック（スタッフ等）
  IF EXISTS (
    SELECT 1 FROM public.users WHERE lower(email) = needle LIMIT 1
  ) THEN
    RETURN 'confirmed';
  END IF;

  -- customers で user_id がある場合もチェック
  IF EXISTS (
    SELECT 1 FROM public.customers 
    WHERE lower(trim(email)) = needle AND user_id IS NOT NULL 
    LIMIT 1
  ) THEN
    RETURN 'confirmed';
  END IF;

  RETURN 'not_registered';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_registration_status TO anon, authenticated;

COMMENT ON FUNCTION public.check_email_registration_status(text) IS
  'メール登録状態を返す: not_registered / pending_confirmation / confirmed';
