CREATE FUNCTION public.get_performance_recruitment_deadline(p_event_id uuid)
RETURNS TABLE(deadline timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.deadline FROM performance_recruitment_deadlines d JOIN schedule_events e ON e.id=d.schedule_event_id AND e.organization_id=d.organization_id
 WHERE e.id=p_event_id AND e.category='open' AND NOT e.is_cancelled AND d.status='active';
$$;
REVOKE ALL ON FUNCTION public.get_performance_recruitment_deadline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_performance_recruitment_deadline(uuid) TO anon, authenticated, service_role;

-- cronが次に動くまでの数秒にも、期限を過ぎた追加予約は受け付けない。
CREATE FUNCTION public.enforce_performance_recruitment_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deadline_at timestamptz;
BEGIN
 IF NEW.status NOT IN ('pending','confirmed','gm_confirmed','checked_in') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.schedule_event_id IS NOT DISTINCT FROM OLD.schedule_event_id
   AND OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<=OLD.participant_count THEN RETURN NEW; END IF;
 PERFORM 1 FROM schedule_events WHERE id=NEW.schedule_event_id FOR UPDATE;
 SELECT deadline INTO deadline_at FROM performance_recruitment_deadlines WHERE schedule_event_id=NEW.schedule_event_id AND status='active';
 IF deadline_at IS NOT NULL AND now()>=deadline_at THEN RAISE EXCEPTION '追加募集の受付期限を過ぎています' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_performance_recruitment_booking() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_performance_recruitment_booking BEFORE INSERT OR UPDATE OF schedule_event_id,status,participant_count ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.enforce_performance_recruitment_booking();
