-- RPC と直接 INSERT/UPDATE の双方で、保存時点の実効締切を強制する。
CREATE OR REPLACE FUNCTION public.assert_private_booking_candidate_date(p_org UUID,p_scenario UUID,p_date DATE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE days INTEGER;
BEGIN
 IF p_org IS NULL OR p_scenario IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'PRIVATE_BOOKING_CONTEXT_REQUIRED' USING ERRCODE='P0045'; END IF;
 days := public.get_effective_private_booking_deadline_days(p_org,NULL,p_scenario);
 IF p_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE + days THEN
   RAISE EXCEPTION 'PRIVATE_BOOKING_DEADLINE_PASSED' USING ERRCODE='P0045';
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_private_booking_candidate_date(UUID,UUID,DATE) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_private_booking_candidate_date(UUID,UUID,DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_private_group_candidate_deadline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE g RECORD;
BEGIN
 IF TG_OP='UPDATE' AND NEW.date IS NOT DISTINCT FROM OLD.date AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id THEN RETURN NEW; END IF;
 SELECT organization_id,COALESCE(scenario_master_id,scenario_id) AS scenario_id INTO g FROM public.private_groups WHERE id=NEW.group_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVATE_GROUP_NOT_FOUND' USING ERRCODE='P0045'; END IF;
 PERFORM public.assert_private_booking_candidate_date(g.organization_id,g.scenario_id,NEW.date);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_private_group_candidate_deadline() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_private_group_candidate_deadline BEFORE INSERT OR UPDATE OF date,group_id ON public.private_group_candidate_dates FOR EACH ROW EXECUTE FUNCTION public.enforce_private_group_candidate_deadline();

CREATE OR REPLACE FUNCTION public.enforce_private_reservation_deadline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c JSONB;
BEGIN
 IF NEW.reservation_source IS DISTINCT FROM 'web_private' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.candidate_datetimes IS NOT DISTINCT FROM OLD.candidate_datetimes AND NEW.scenario_id IS NOT DISTINCT FROM OLD.scenario_id AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id AND NEW.reservation_source IS NOT DISTINCT FROM OLD.reservation_source THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.candidate_datetimes->'candidates') IS DISTINCT FROM 'array' OR (TG_OP='INSERT' AND jsonb_array_length(NEW.candidate_datetimes->'candidates')=0) THEN
  RAISE EXCEPTION 'PRIVATE_BOOKING_CANDIDATES_REQUIRED' USING ERRCODE='P0045';
 END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(NEW.candidate_datetimes->'candidates') LOOP
  -- 受付済みの日付の承認・状態変更・候補削除は、受付締切で再拒否しない。
  IF TG_OP='UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
     AND NEW.scenario_id IS NOT DISTINCT FROM OLD.scenario_id
     AND NEW.reservation_source IS NOT DISTINCT FROM OLD.reservation_source
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(OLD.candidate_datetimes->'candidates','[]'::JSONB)) old_candidate WHERE old_candidate->>'date'=c->>'date') THEN CONTINUE; END IF;
  PERFORM public.assert_private_booking_candidate_date(NEW.organization_id,NEW.scenario_id,(c->>'date')::DATE);
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_private_reservation_deadline() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_private_reservation_deadline BEFORE INSERT OR UPDATE OF candidate_datetimes,scenario_id,organization_id,reservation_source ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.enforce_private_reservation_deadline();
