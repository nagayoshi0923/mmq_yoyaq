-- スタッフ/管理者がグループにメッセージを送信するRPC
-- RLSをバイパスして、組織に所属するスタッフがメッセージを送信できるようにする

CREATE OR REPLACE FUNCTION public.send_staff_group_message(
  p_group_id UUID,
  p_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_staff_org_id UUID;
  v_group_org_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ログインが必要です';
  END IF;
  
  -- is_staff_or_admin() ヘルパーを使用
  IF NOT public.is_staff_or_admin() THEN
    RAISE EXCEPTION 'スタッフ権限がありません';
  END IF;
  
  -- スタッフの組織IDを取得
  SELECT organization_id INTO v_staff_org_id
  FROM public.staff
  WHERE user_id = v_user_id
  LIMIT 1;
  
  IF v_staff_org_id IS NULL THEN
    RAISE EXCEPTION 'スタッフ情報が見つかりません';
  END IF;
  
  -- グループの組織IDを取得
  SELECT organization_id INTO v_group_org_id
  FROM public.private_groups
  WHERE id = p_group_id;
  
  IF v_group_org_id IS NULL THEN
    RAISE EXCEPTION 'グループが見つかりません';
  END IF;
  
  IF v_staff_org_id != v_group_org_id THEN
    RAISE EXCEPTION '他組織のグループにはメッセージを送信できません';
  END IF;
  
  INSERT INTO public.private_group_messages (group_id, message)
  VALUES (
    p_group_id,
    jsonb_build_object(
      'type', 'system',
      'action', 'staff_message',
      'title', '店舗からのお知らせ',
      'body', p_message
    )::text
  );
  
  RETURN TRUE;
END;
$$;

-- 認証済みユーザーのみ実行可能
GRANT EXECUTE ON FUNCTION public.send_staff_group_message(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.send_staff_group_message IS 'スタッフ/管理者がグループにシステムメッセージを送信';
