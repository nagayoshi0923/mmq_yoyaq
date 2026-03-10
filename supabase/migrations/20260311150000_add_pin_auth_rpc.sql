-- PIN認証用RPC関数
-- 作成日: 2026-03-11

-- PIN認証関数: メールアドレスとPINでゲストメンバーを認証
CREATE OR REPLACE FUNCTION public.authenticate_guest_by_pin(
  p_group_id UUID,
  p_email TEXT,
  p_pin TEXT
)
RETURNS TABLE (
  member_id UUID,
  guest_name TEXT,
  guest_email TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pgm.id AS member_id,
    pgm.guest_name,
    pgm.guest_email
  FROM public.private_group_members pgm
  WHERE pgm.group_id = p_group_id
    AND LOWER(pgm.guest_email) = LOWER(p_email)
    AND pgm.access_pin = p_pin
    AND pgm.status = 'joined'
  LIMIT 1;
END;
$$;

-- 関数に対するコメント
COMMENT ON FUNCTION public.authenticate_guest_by_pin IS 'ゲストメンバーのPIN認証。メールアドレスとPINが一致するメンバー情報を返す';

-- 匿名ユーザーでも実行可能に
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: PIN認証用RPC関数を追加';
END $$;
