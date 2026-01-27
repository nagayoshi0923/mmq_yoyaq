-- =============================================================================
-- マイグレーション 012: 公演一括キャンセルRPC
-- =============================================================================
-- 
-- 作成日: 2026-01-28
-- 
-- 目的:
--   公演中止時に全予約を一括キャンセル（パフォーマンス改善）
--   20件以上の予約がある公演でも高速にキャンセル処理
-- 
-- =============================================================================

-- 公演の全予約を一括キャンセル
CREATE OR REPLACE FUNCTION cancel_event_reservations(
  p_event_id UUID,
  p_reason TEXT DEFAULT '公演中止'
)
RETURNS TABLE(
  cancelled_count INTEGER,
  reservation_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_count INTEGER := 0;
  v_reservation_ids UUID[];
  v_event_org_id UUID;
BEGIN
  -- イベントの組織IDを取得（権限チェック用）
  SELECT organization_id INTO v_event_org_id
  FROM schedule_events
  WHERE id = p_event_id;
  
  IF v_event_org_id IS NULL THEN
    RAISE EXCEPTION 'イベントが見つかりません: %', p_event_id;
  END IF;
  
  -- 権限チェック: 組織のスタッフまたは管理者のみ
  IF NOT (
    is_org_admin() OR 
    EXISTS (
      SELECT 1 FROM staff 
      WHERE user_id = auth.uid() 
        AND organization_id = v_event_org_id 
        AND status = 'active'
    )
  ) THEN
    RAISE EXCEPTION '権限がありません';
  END IF;
  
  -- キャンセル対象の予約IDを取得
  SELECT ARRAY_AGG(id) INTO v_reservation_ids
  FROM reservations
  WHERE schedule_event_id = p_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed')
    AND (is_cancelled = false OR is_cancelled IS NULL);
  
  IF v_reservation_ids IS NULL OR array_length(v_reservation_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, ARRAY[]::UUID[];
    RETURN;
  END IF;
  
  -- 一括キャンセル
  UPDATE reservations
  SET 
    status = 'cancelled',
    is_cancelled = true,
    cancelled_at = NOW(),
    cancellation_reason = p_reason,
    updated_at = NOW()
  WHERE id = ANY(v_reservation_ids);
  
  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;
  
  -- current_participants を 0 にリセット
  UPDATE schedule_events
  SET 
    current_participants = 0,
    updated_at = NOW()
  WHERE id = p_event_id;
  
  RAISE NOTICE '公演 % の予約を一括キャンセル: % 件', p_event_id, v_cancelled_count;
  
  RETURN QUERY SELECT v_cancelled_count, v_reservation_ids;
END;
$$;

COMMENT ON FUNCTION cancel_event_reservations(UUID, TEXT) IS 
'公演中止時に全予約を一括キャンセル。予約IDの配列を返す（メール送信用）';

-- 認証済みユーザーに実行権限を付与
GRANT EXECUTE ON FUNCTION cancel_event_reservations(UUID, TEXT) TO authenticated;

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 012 完了: 一括キャンセルRPCを追加';
END $$;

-- =============================================================================
-- ロールバックSQL（必要な場合のみ実行）
-- =============================================================================
/*
DROP FUNCTION IF EXISTS cancel_event_reservations(UUID, TEXT);
*/

