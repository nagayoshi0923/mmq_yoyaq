-- =============================================================================
-- マイグレーション: 予約更新・キャンセル RPC 関数を追加
-- =============================================================================
-- 
-- 作成日: 2026-03-10
-- 
-- 問題:
--   update_reservation_participants と cancel_reservation_with_lock が
--   supabase/migrations に含まれておらず、ステージング環境で 500 エラーが発生
-- 
-- 解決:
--   database/migrations/013 と 030 の内容を supabase/migrations に追加
-- 
-- =============================================================================

-- =============================================================================
-- 1. update_reservation_participants 関数
-- =============================================================================

-- 既存の関数を削除（オーバーロード対応）
DROP FUNCTION IF EXISTS public.update_reservation_participants(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS public.update_reservation_participants(UUID, INTEGER);

CREATE OR REPLACE FUNCTION update_reservation_participants(
  p_reservation_id UUID,
  p_new_count INTEGER,
  p_customer_id UUID DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_event_id UUID;
  v_old_count INTEGER;
  v_diff INTEGER;
  v_max_participants INTEGER;
  v_current_participants INTEGER;
  v_org_id UUID;
  v_reservation_customer_id UUID;
  v_unit_price INTEGER;
  v_new_total_price INTEGER;
  v_new_final_price INTEGER;
BEGIN
  IF p_new_count <= 0 THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT' USING ERRCODE = 'P0006';
  END IF;

  -- 予約情報を取得
  SELECT schedule_event_id, participant_count, customer_id, organization_id, unit_price
  INTO v_event_id, v_old_count, v_reservation_customer_id, v_org_id, v_unit_price
  FROM reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0007';
  END IF;

  -- 🔒 権限チェック
  IF p_customer_id IS NOT NULL THEN
    -- 顧客の場合: 自分の予約のみ変更可能
    IF v_reservation_customer_id != p_customer_id THEN
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

  v_diff := p_new_count - v_old_count;

  -- 増加時のみ在庫確認
  IF v_diff > 0 THEN
    SELECT COALESCE(max_participants, capacity, 8)
    INTO v_max_participants
    FROM schedule_events
    WHERE id = v_event_id
    FOR UPDATE;

    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_current_participants
    FROM reservations
    WHERE schedule_event_id = v_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed');

    IF v_current_participants + v_diff > v_max_participants THEN
      RAISE EXCEPTION 'INSUFFICIENT_SEATS' USING ERRCODE = 'P0008';
    END IF;
  END IF;

  -- 料金を再計算（unit_price × 新人数）
  v_new_total_price := COALESCE(v_unit_price, 0) * p_new_count;
  v_new_final_price := v_new_total_price;

  -- 予約の参加人数と料金を更新
  UPDATE reservations
  SET participant_count = p_new_count,
      base_price = v_new_total_price,
      total_price = v_new_total_price,
      final_price = v_new_final_price,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を調整
  UPDATE schedule_events
  SET current_participants = current_participants + v_diff,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) TO authenticated;

COMMENT ON FUNCTION update_reservation_participants(UUID, INTEGER, UUID) IS 
'予約の参加人数を変更。顧客は自分の予約のみ、スタッフは組織内の予約を変更可能。料金も再計算。';

-- =============================================================================
-- 2. cancel_reservation_with_lock 関数（最新版で上書き）
-- =============================================================================

-- 既存の関数を削除（オーバーロード対応）
DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, TEXT);
DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, UUID, TEXT);

-- シグネチャ 1: (UUID, TEXT)
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック（自分の予約か、同組織の admin のみ許可）
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_reservation.customer_id AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin/staff
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff 
        WHERE user_id = auth.uid() 
          AND organization_id = v_reservation.organization_id 
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を再計算（絶対値で再集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) TO authenticated;

-- シグネチャ 2: (UUID, UUID, TEXT) — customer_id 指定版
CREATE OR REPLACE FUNCTION public.cancel_reservation_with_lock(
  p_reservation_id UUID,
  p_customer_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
BEGIN
  -- 予約をロック
  SELECT id, schedule_event_id, status, customer_id, organization_id
  INTO v_reservation
  FROM public.reservations
  WHERE id = p_reservation_id
    AND status != 'cancelled'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE = 'P0005';
  END IF;

  v_event_id := v_reservation.schedule_event_id;

  -- 組織境界チェック
  v_caller_org_id := get_user_organization_id();

  IF NOT (
    -- 自分の予約（顧客として — customer_id で照合）
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = COALESCE(p_customer_id, v_reservation.customer_id)
        AND c.user_id = auth.uid()
    )
    OR (
      -- 同組織の admin
      is_org_admin()
      AND (v_caller_org_id IS NOT DISTINCT FROM v_reservation.organization_id)
    )
    OR (
      -- スタッフ権限
      EXISTS (
        SELECT 1 FROM staff 
        WHERE user_id = auth.uid() 
          AND organization_id = v_reservation.organization_id 
          AND status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0009';
  END IF;

  -- ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 在庫を再計算（絶対値で再集計）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) IS 
'予約をキャンセル（2パラメーター版）。顧客は自分の予約のみ、スタッフは組織内の予約をキャンセル可能。';

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) IS 
'予約をキャンセル（3パラメーター版）。顧客は自分の予約のみ、スタッフは組織内の予約をキャンセル可能。';

-- =============================================================================
-- 完了確認
-- =============================================================================

DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: 予約更新・キャンセル RPC 関数を追加';
  RAISE NOTICE '   - update_reservation_participants: 参加人数変更 + 料金再計算';
  RAISE NOTICE '   - cancel_reservation_with_lock: 2パラメーター版と3パラメーター版';
END $$;
