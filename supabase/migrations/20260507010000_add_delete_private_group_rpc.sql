-- 主催者がグループを削除するRPC
-- 複数テーブルへの RLS 依存チェーンを避けるため SECURITY DEFINER で一括削除

CREATE OR REPLACE FUNCTION public.delete_private_group(
  p_group_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_group RECORD;
  v_caller_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'ログインが必要です' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, organizer_id, status
  INTO v_group
  FROM private_groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'グループが見つかりません' USING ERRCODE = 'P0002';
  END IF;

  IF v_group.organizer_id != v_caller_id THEN
    RAISE EXCEPTION '削除できるのは主催者のみです' USING ERRCODE = 'P0010';
  END IF;

  IF v_group.status NOT IN ('gathering', 'cancelled') THEN
    RAISE EXCEPTION '削除できるのは予約申請前または キャンセル済みのグループのみです' USING ERRCODE = 'P0003';
  END IF;

  -- 依存テーブルを順番に削除（CASCADE があるが明示的に削除して確実に）
  DELETE FROM private_group_date_responses WHERE group_id = p_group_id;
  DELETE FROM private_group_candidate_dates WHERE group_id = p_group_id;
  DELETE FROM private_group_messages WHERE group_id = p_group_id;
  DELETE FROM private_group_members WHERE group_id = p_group_id;
  DELETE FROM private_groups WHERE id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_private_group(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_private_group IS
'主催者がグループを削除する（gathering/cancelled のみ）。SECURITY DEFINER で RLS をバイパスし一括削除。';
