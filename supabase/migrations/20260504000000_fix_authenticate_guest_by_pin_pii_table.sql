-- ====================================================================
-- 修正: authenticate_guest_by_pin RPC関数をPIIテーブル対応に更新
-- ====================================================================
-- 問題: 2026-04-12 に access_pin が private_group_members から 
--       private_group_members_pii に移動されたが、RPC関数は古い
--       テーブル構造を参照し続けているため PIN認証が失敗する
--
-- 解決: RPC関数を更新して private_group_members_pii テーブルから
--       access_pin を取得するよう修正
-- ====================================================================

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
    pii.guest_name,
    pii.guest_email
  FROM public.private_group_members pgm
  JOIN public.private_group_members_pii pii ON pii.member_id = pgm.id
  WHERE pgm.group_id = p_group_id
    AND LOWER(pii.guest_email) = LOWER(p_email)
    AND pii.access_pin = p_pin
    AND pgm.status = 'joined'
  LIMIT 1;
END;
$$;

-- 関数に対するコメント
COMMENT ON FUNCTION public.authenticate_guest_by_pin IS 'ゲストメンバーのPIN認証。PIIテーブルからaccess_pinを取得してメールアドレスとPINが一致するメンバー情報を返す';

-- 匿名ユーザーでも実行可能に（既存権限を維持）
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO anon;
GRANT EXECUTE ON FUNCTION public.authenticate_guest_by_pin TO authenticated;

-- ====================================================================
-- 修正: save_guest_access_pin RPC関数もPIIテーブル対応に更新
-- ====================================================================
-- 同様に save_guest_access_pin も private_group_members_pii テーブルに
-- access_pin を保存するよう修正

CREATE OR REPLACE FUNCTION public.save_guest_access_pin(
  p_member_id UUID,
  p_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
BEGIN
  -- メンバーが存在し、ゲストユーザーであることを確認
  SELECT * INTO v_member 
  FROM public.private_group_members 
  WHERE id = p_member_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  
  -- ゲストユーザー（user_idがNULL）のみPINを設定可能
  IF v_member.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only guest members can have PIN';
  END IF;
  
  -- PIIテーブルにPINを保存（UPSERT）
  INSERT INTO public.private_group_members_pii (member_id, access_pin, updated_at)
  VALUES (p_member_id, p_pin, NOW())
  ON CONFLICT (member_id) DO UPDATE SET
    access_pin = EXCLUDED.access_pin,
    updated_at = NOW();
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.save_guest_access_pin IS 'ゲストメンバーのアクセスPINをPIIテーブルに保存する';

-- 匿名ユーザーでも実行可能に（既存権限を維持）
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO anon;
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: PIN認証関連RPC関数をPIIテーブル対応に更新';
  RAISE NOTICE '  - authenticate_guest_by_pin: access_pin の参照先を private_group_members_pii に変更';
  RAISE NOTICE '  - save_guest_access_pin: access_pin の保存先を private_group_members_pii に変更';
  RAISE NOTICE '  - guest_name, guest_email も PIIテーブルから取得するよう修正';
END $$;