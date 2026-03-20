-- complete-profile: 同じメールが「別の auth ユーザー」の顧客行に既に紐付いているか
-- check_email_registered は public.users も見るため、ログイン済みでは常に true になり使えない

CREATE OR REPLACE FUNCTION public.is_customer_email_linked_to_other_user(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.email IS NOT NULL
      AND lower(trim(c.email)) = lower(trim(p_email))
      AND c.user_id IS NOT NULL
      AND c.user_id <> auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_customer_email_linked_to_other_user(text) TO authenticated;

COMMENT ON FUNCTION public.is_customer_email_linked_to_other_user(text) IS
  '顧客プロフィール未作成のセッションで、メールが他ユーザーの customers に取られているか（二重登録案内用）';
