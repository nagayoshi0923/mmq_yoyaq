-- ゲストユーザーのPIN保存用RPC関数（SECURITY DEFINER）

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
  
  -- PINを保存
  UPDATE public.private_group_members
  SET access_pin = p_pin
  WHERE id = p_member_id;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.save_guest_access_pin IS 'ゲストメンバーのアクセスPINを保存する';

-- 匿名ユーザーでも実行可能に
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO anon;
GRANT EXECUTE ON FUNCTION public.save_guest_access_pin TO authenticated;

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ ゲストPIN保存用RPC関数を追加しました';
END $$;
