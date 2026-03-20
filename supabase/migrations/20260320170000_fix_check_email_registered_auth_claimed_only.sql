-- check_email_registered: 「Auth と紐付いた顧客」または app users のみ true にする
-- customers にメールだけある（user_id NULL・店舗登録のみ等）と Auth にユーザーがいないのに
-- 新規登録でマジックリンクが送れない問題を解消する

CREATE OR REPLACE FUNCTION public.check_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(p_email));
BEGIN
  IF needle IS NULL OR needle = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.email IS NOT NULL
      AND lower(trim(c.email)) = needle
      AND c.user_id IS NOT NULL
    LIMIT 1
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.email IS NOT NULL
      AND lower(u.email) = needle
    LIMIT 1
  );
END;
$$;

COMMENT ON FUNCTION public.check_email_registered(text) IS
  '新規登録ガード: メールが「顧客として Auth 済み」または public.users にあるか。user_id 未設定の顧客メールのみでは false（初回マジックリンク可）';
