ALTER TABLE public.schedule_events ADD COLUMN booking_cutoff_minutes integer CHECK (booking_cutoff_minutes BETWEEN 0 AND 1440);

-- 公開済み公演と同じ非機密の締切情報のみ。顧客・社内判断理由は返さない。
CREATE FUNCTION public.get_performance_booking_window(p_event_id uuid)
RETURNS TABLE(judgment_deadline timestamptz, judgment_status text, booking_deadline timestamptz,
 effective_booking_deadline timestamptz, override_minutes integer, default_minutes integer, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH settings AS (
  SELECT e.id,e.updated_at,e.booking_cutoff_minutes,
    (e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo' AS starts_at,
    GREATEST(COALESCE(e.reservation_deadline_hours,0),COALESCE(rs.same_day_booking_cutoff,0),0)*60 AS default_minutes,
    d.deadline,d.status,
    EXISTS(SELECT 1 FROM performance_cancellation_logs l WHERE l.schedule_event_id=e.id AND l.organization_id=e.organization_id AND l.result='confirmed') AS was_confirmed
  FROM schedule_events e
  LEFT JOIN reservation_settings rs ON rs.store_id=e.store_id AND rs.organization_id=e.organization_id
  LEFT JOIN performance_recruitment_deadlines d ON d.schedule_event_id=e.id AND d.organization_id=e.organization_id
  WHERE e.id=p_event_id AND e.category='open' AND NOT e.is_cancelled
 ), resolved AS (
  SELECT *,starts_at-make_interval(mins=>COALESCE(booking_cutoff_minutes,default_minutes)) AS cutoff FROM settings
 )
 SELECT COALESCE(deadline,starts_at-interval '4 hours'),
   COALESCE(status,CASE WHEN was_confirmed THEN 'confirmed' ELSE 'pending' END),cutoff,
   CASE WHEN status='active' THEN deadline ELSE cutoff END,booking_cutoff_minutes,default_minutes,updated_at
 FROM resolved;
$$;
REVOKE ALL ON FUNCTION public.get_performance_booking_window(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_booking_window(uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enforce_performance_recruitment_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deadline_at timestamptz;
BEGIN
 IF NEW.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.schedule_event_id IS NOT DISTINCT FROM OLD.schedule_event_id
   AND OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<=OLD.participant_count THEN RETURN NEW; END IF;
 PERFORM 1 FROM schedule_events WHERE id=NEW.schedule_event_id FOR UPDATE;
 SELECT effective_booking_deadline INTO deadline_at FROM get_performance_booking_window(NEW.schedule_event_id);
 IF deadline_at IS NOT NULL AND now()>=deadline_at THEN RAISE EXCEPTION '予約の受付期限を過ぎています' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_performance_recruitment_booking() FROM PUBLIC,anon,authenticated;
