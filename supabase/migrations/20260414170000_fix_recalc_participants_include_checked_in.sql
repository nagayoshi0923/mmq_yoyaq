-- =============================================================================
-- バグ修正: recalc_current_participants_for_event に checked_in を追加
-- =============================================================================
--
-- 問題:
--   recalc_current_participants_for_event() が status IN ('pending', 'confirmed', 'gm_confirmed')
--   のみを集計しており、checked_in が除外されていた。
--
--   結果として、参加者がチェックイン（checked_in）すると current_participants が減少し、
--   「満席なのに空き席あり」と誤表示される。
--   → 別の顧客が予約できてしまう（スタッフ目線で「満席なのに申し込みが来る」）。
--
--   ※ create_reservation_with_lock_v2 の在庫チェックは 20260414100000 で checked_in を追加済みだが、
--     INSERT 後に呼び出す recalc_current_participants_for_event() が正しくないため、
--     current_participants が過小な値のまま残り、次のリクエスト時の RPC チェックも狂う。
--
-- 修正:
--   1. recalc_current_participants_for_event に 'checked_in' を追加
--   2. schedule_events.current_participants を正しい値に一括再計算（既存データ修復）
--
-- =============================================================================

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

-- 既存の全公演の current_participants を正しい値に一括再計算
-- （過去に checked_in を除外していたためズレが生じている可能性がある）
DO $$
DECLARE
  v_event_id UUID;
BEGIN
  FOR v_event_id IN
    SELECT DISTINCT schedule_event_id
    FROM reservations
    WHERE status IN ('checked_in')
      AND schedule_event_id IS NOT NULL
  LOOP
    PERFORM public.recalc_current_participants_for_event(v_event_id);
  END LOOP;
  RAISE NOTICE '✅ checked_in を含む current_participants を再計算しました';
END $$;
