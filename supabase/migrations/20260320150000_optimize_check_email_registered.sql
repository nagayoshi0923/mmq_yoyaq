-- check_email_registered 用: lower(email) 照会でシーケンシャルスキャンを避ける
-- 新規登録フローは RPC → signInWithOtp の直列のため、ここが遅いと全体が遅く感じる

CREATE INDEX IF NOT EXISTS idx_customers_lower_email ON public.customers (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));

COMMENT ON INDEX idx_customers_lower_email IS 'check_email_registered / メール重複チェック用';
COMMENT ON INDEX idx_users_lower_email IS 'check_email_registered / メール重複チェック用';

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
    SELECT 1 FROM public.customers c
    WHERE c.email IS NOT NULL AND lower(c.email) = needle
    LIMIT 1
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email IS NOT NULL AND lower(u.email) = needle
    LIMIT 1
  );
END;
$$;
