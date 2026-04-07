-- =============================================================================
-- マイグレーション: checked_in を current_participants のカウント対象に含める
-- =============================================================================
--
-- 問題:
--   20260405100000_add_checked_in_status.sql で checked_in ステータスを追加したが、
--   current_participants を集計するトリガーおよびRPCが
--   status IN ('pending', 'confirmed', 'gm_confirmed') のままで、
--   checked_in が除外されていた。
--
--   その結果、公演当日にスタッフが来店確認（チェックイン）を行うと
--   current_participants が減少し、4時間前中止判定で参加者不足と誤判定されて
--   公演が誤キャンセルされる重大バグが発生する。
--
-- 修正対象:
--   1. recalc_current_participants_for_event (トリガー関数) ← 最重要
--   2. cancel_reservation_with_lock (シグネチャ1: UUID, TEXT)
--   3. cancel_reservation_with_lock (シグネチャ2: UUID, UUID, TEXT)
--   4. update_reservation_participants (在庫チェック部分)
--   5. 既存データの current_participants を再計算
-- =============================================================================

-- ============================================================
-- 1. トリガー関数を修正（最重要: 全ての status 変更に影響）
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_current_participants_for_event(p_event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  UPDATE schedule_events se
  SET current_participants = COALESCE((
    SELECT SUM(r.participant_count)
    FROM reservations r
    WHERE r.schedule_event_id = se.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in')
  ), 0)
  WHERE se.id = p_event_id;
END;
$$;

COMMENT ON FUNCTION public.recalc_current_participants_for_event(UUID) IS
'reservations の集計値から schedule_events.current_participants を再計算して更新する（checked_in を含む）。';

-- ============================================================
-- 2. cancel_reservation_with_lock (シグネチャ1: UUID, TEXT)
--    在庫再計算部分のみ checked_in を追加。その他のロジックは原型を保持。
-- ============================================================
DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, TEXT);

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

  -- 在庫を再計算（checked_in を含む）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, TEXT) IS
'予約をキャンセル（2パラメーター版）。顧客は自分の予約のみ、スタッフは組織内の予約をキャンセル可能。';

-- ============================================================
-- 3. cancel_reservation_with_lock (シグネチャ2: UUID, UUID, TEXT)
-- ============================================================
DROP FUNCTION IF EXISTS public.cancel_reservation_with_lock(UUID, UUID, TEXT);

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

  -- 在庫を再計算（checked_in を含む）
  SELECT COALESCE(SUM(participant_count), 0)
  INTO v_actual_participants
  FROM reservations
  WHERE schedule_event_id = v_event_id
    AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

  UPDATE schedule_events
  SET current_participants = v_actual_participants,
      updated_at = NOW()
  WHERE id = v_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION cancel_reservation_with_lock(UUID, UUID, TEXT) IS
'予約をキャンセル（3パラメーター版）。顧客は自分の予約のみ、スタッフは組織内の予約をキャンセル可能。';

-- ============================================================
-- 4. update_reservation_participants: 在庫チェック部分も修正
--    checked_in の人が座席を占有しているため、増員時のチェックに含める
-- ============================================================
DROP FUNCTION IF EXISTS public.update_reservation_participants(UUID, INTEGER, UUID);

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

  -- 増加時のみ在庫確認（checked_in を含めて正確な空席数を計算）
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
      AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

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

  -- 在庫を差分で調整（トリガーが絶対値で再計算するが念のため）
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

-- ============================================================
-- 5. 既存データの current_participants を全件再計算
--    （チェックイン済みの予約が除外されて不整合になっているデータを修正）
-- ============================================================
DO $$
DECLARE
  v_fixed_count INTEGER := 0;
  v_event RECORD;
  v_correct_count INTEGER;
BEGIN
  FOR v_event IN
    SELECT DISTINCT r.schedule_event_id
    FROM reservations r
    WHERE r.status = 'checked_in'
      AND r.schedule_event_id IS NOT NULL
  LOOP
    SELECT COALESCE(SUM(participant_count), 0)
    INTO v_correct_count
    FROM reservations
    WHERE schedule_event_id = v_event.schedule_event_id
      AND status IN ('pending', 'confirmed', 'gm_confirmed', 'checked_in');

    UPDATE schedule_events
    SET current_participants = v_correct_count,
        updated_at = NOW()
    WHERE id = v_event.schedule_event_id
      AND current_participants IS DISTINCT FROM v_correct_count;

    IF FOUND THEN
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ current_participants 再計算完了: %件のイベントを修正', v_fixed_count;
END $$;

DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: checked_in を current_participants に含めるよう修正';
  RAISE NOTICE '   - recalc_current_participants_for_event: checked_in を追加（トリガー）';
  RAISE NOTICE '   - cancel_reservation_with_lock (2シグネチャ): 在庫再計算に checked_in を追加';
  RAISE NOTICE '   - update_reservation_participants: 在庫チェックに checked_in を追加';
  RAISE NOTICE '   - 既存の checked_in 予約がある公演の current_participants を再計算';
END $$;
