-- メールアドレスが既に登録済みかどうかを確認する RPC
-- 新規登録時に既存ユーザーへの不正なマジックリンク送信を防ぐために使用する
-- SECURITY DEFINER で実行するため anon からでも呼び出し可能
-- NOTE: このエンドポイントはメールアドレスの存在確認ができるため、
--       利用目的を登録フォームからの呼び出しに限定すること。
--       Supabase のレート制限が攻撃的な列挙を抑制する。

CREATE OR REPLACE FUNCTION public.check_email_registered(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- customers テーブル（顧客）と users テーブル（スタッフ/管理者）の両方を確認する
  RETURN EXISTS (
    SELECT 1 FROM public.customers WHERE lower(email) = lower(trim(p_email))
    UNION ALL
    SELECT 1 FROM public.users WHERE lower(email) = lower(trim(p_email))
  );
END;
$$;

-- anon（未ログイン）と authenticated（ログイン済み）の両方から呼び出し可能にする
GRANT EXECUTE ON FUNCTION public.check_email_registered TO anon, authenticated;
