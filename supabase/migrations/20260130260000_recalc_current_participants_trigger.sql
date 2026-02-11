-- =============================================================================
-- 20260130260000: current_participants の整合性トリガ（SEC-P1-02）
-- =============================================================================
--
-- 目的:
-- - 予約の作成/人数変更/キャンセル/日程変更など複数経路で current_participants がズレる事故を防ぐ
-- - schedule_events.current_participants は「reservations の集計値」に常に追従させる
--
-- 方針:
-- - reservations 変更時に schedule_events.current_participants を再集計して更新
-- - RLS/FORCE RLS 環境でも動くよう row_security=off を明示
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
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed')
  ), 0)
  WHERE se.id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_current_participants_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(OLD.schedule_event_id);
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.schedule_event_id IS DISTINCT FROM NEW.schedule_event_id THEN
    IF OLD.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(OLD.schedule_event_id);
    END IF;
    IF NEW.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(NEW.schedule_event_id);
    END IF;
  ELSE
    IF NEW.schedule_event_id IS NOT NULL THEN
      PERFORM public.recalc_current_participants_for_event(NEW.schedule_event_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalc_participants ON public.reservations;

-- schedule_event_id カラムが存在する場合のみトリガーを作成
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reservations' AND column_name = 'schedule_event_id'
  ) THEN
    CREATE TRIGGER trigger_recalc_participants
    AFTER INSERT OR UPDATE OF participant_count, status, schedule_event_id OR DELETE ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.recalc_current_participants_trigger();
  END IF;
END $$;

COMMENT ON FUNCTION public.recalc_current_participants_for_event(UUID) IS
'reservations の集計値から schedule_events.current_participants を再計算して更新する（SEC-P1-02）。';

COMMENT ON FUNCTION public.recalc_current_participants_trigger() IS
'reservations の変更を契機に current_participants を再計算するトリガ関数（row_security=off）。';

