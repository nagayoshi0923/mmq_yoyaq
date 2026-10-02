-- 2026-10-01 本番取得定義を基準とする参照用。staging独自の募集停止判定はmigrationで保持する。
CREATE OR REPLACE FUNCTION public.update_reservation_participants(p_reservation_id uuid, p_new_count integer, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
  END IF;

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

  -- reservation_actor_auth_v1: 旧引数は対象の照合用であり本人証明ではない。
  IF p_customer_id IS NOT NULL
     AND v_reservation_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0010';
  END IF;

  IF NOT COALESCE(public.reservation_actor_is_org_operator(v_org_id), false)
     AND NOT EXISTS (
       SELECT 1 FROM public.customers
       WHERE id = v_reservation_customer_id AND user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0011';
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
  -- ※ この UPDATE で recalc_current_participants_trigger が発火し、
  --   schedule_events.current_participants を実数合計の絶対値に再計算する。
  --   以前はこの後に current_participants += v_diff を手動実行していたが、
  --   トリガーによる絶対値再計算と二重に加算され、満席ギリギリの公演で
  --   check 制約に違反していたため削除した（在庫の更新はトリガーに一任）。
  UPDATE reservations
  SET participant_count = p_new_count,
      base_price = v_new_total_price,
      total_price = v_new_total_price,
      final_price = v_new_final_price,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$function$
