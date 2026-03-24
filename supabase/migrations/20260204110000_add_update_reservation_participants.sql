-- =============================================================================
-- マイグレーション: update_reservation_participants RPC関数を修正
-- =============================================================================
-- 
-- 作成日: 2026-02-04
-- 
-- 問題:
--   current_participants が実際の予約データと同期していない場合、
--   CHECK制約 (schedule_events_participants_check) に違反してエラーになる
-- 
-- 修正:
--   差分更新ではなく、予約テーブルから再計算して絶対値を設定する
-- 
-- =============================================================================

-- NOTE: is_org_admin() は既に存在することを前提とする
-- 存在しない場合は 20260204120000_fix_is_org_admin_restore.sql で復元される

-- -----------------------------------------------------------------------------
-- RPC: 参加人数変更（絶対値で再計算）
-- -----------------------------------------------------------------------------

-- 既存の関数を削除（シグネチャが異なる場合に備えて）
DROP FUNCTION IF EXISTS update_reservation_participants(UUID, INTEGER, UUID);

CREATE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INTEGER,
  p_customer_id UUID DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $func$
DECLARE
  v_event_id UUID;
  v_old_count INTEGER;
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_new_total INTEGER;
  v_org_id UUID;
  v_reservation_customer_id UUID;
BEGIN
  -- バリデーション
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  -- 予約情報を取得
  SELECT schedule_event_id, participant_count, customer_id, organization_id
  INTO v_event_id, v_old_count, v_reservation_customer_id, v_org_id
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  -- 権限チェック
  IF p_customer_id IS NOT NULL THEN
    -- 顧客の場合: 自分の予約のみ変更可能
    IF v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
    END IF;
  ELSE
    -- customer_id がNULLの場合: 管理者 or 組織スタッフのみ
    IF NOT (
      is_org_admin() OR 
      EXISTS (
        SELECT 1 FROM staff 
        WHERE user_id = auth.uid() 
          AND organization_id = v_org_id 
          AND status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
    END IF;
  END IF;

  -- 変更なしの場合は早期リターン
  IF p_new_count = v_old_count THEN
    RETURN TRUE;
  END IF;

  -- イベント情報を取得（ロック）
  SELECT COALESCE(max_participants, capacity, 8)
  INTO v_max_participants
  FROM schedule_events
  WHERE id = v_event_id
  FOR UPDATE;

  -- 現在の予約から参加人数を再計算（この予約を除く）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_current_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND id != p_reservation_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  -- 新しい合計を計算
  v_new_total := v_current_participants + p_new_count;

  -- 在庫チェック
  IF v_new_total > v_max_participants THEN
    RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0008';
  END IF;

  -- 予約の参加人数を更新
  UPDATE reservations
  SET participant_count = p_new_count,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を絶対値で更新（差分ではなく再計算した値を設定）
  UPDATE schedule_events
  SET current_participants = v_new_total,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$func$;

-- 実行権限を付与
GRANT EXECUTE ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) IS 
'予約の参加人数を変更。顧客は自分の予約のみ、スタッフは組織内の予約を変更可能。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: update_reservation_participants RPC関数を追加';
END $$;
