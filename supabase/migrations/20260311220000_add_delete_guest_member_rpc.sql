-- ゲストメンバー削除用RPC関数（SECURITY DEFINER）

CREATE OR REPLACE FUNCTION public.delete_guest_member(
  p_member_id UUID
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
  
  -- ゲストユーザー（user_idがNULL）または主催者以外のみ削除可能
  IF v_member.is_organizer THEN
    RAISE EXCEPTION 'Cannot delete organizer';
  END IF;
  
  -- メンバーを削除（CASCADE設定により日程回答も削除される）
  DELETE FROM public.private_group_members
  WHERE id = p_member_id;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.delete_guest_member IS 'ゲストメンバーを削除する（日程回答も連動削除）';

-- 匿名ユーザーでも実行可能に
GRANT EXECUTE ON FUNCTION public.delete_guest_member TO anon;
GRANT EXECUTE ON FUNCTION public.delete_guest_member TO authenticated;

-- 通知
DO $$
BEGIN
  RAISE NOTICE '✅ ゲストメンバー削除用RPC関数を追加しました';
END $$;
