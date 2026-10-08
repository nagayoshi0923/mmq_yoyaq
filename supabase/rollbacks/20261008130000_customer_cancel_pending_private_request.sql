-- 20261008130000 の取り消し: assert_customer_cancellation_policy を変更前の定義へ戻す
CREATE OR REPLACE FUNCTION public.assert_customer_cancellation_policy(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 r public.reservations; e public.schedule_events;
 v_type text; v_key text; v_deadline numeric; v_fees jsonb; v_rule jsonb;
 v_hours numeric; v_fee numeric := 0; v_setting jsonb;
BEGIN
 SELECT * INTO r FROM public.reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND' USING ERRCODE='P0005'; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0009'; END IF;
 IF COALESCE((public.is_org_admin() AND public.get_user_organization_id() IS NOT DISTINCT FROM r.organization_id)
   OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=auth.uid() AND organization_id=r.organization_id AND status='active'),false) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=r.customer_id AND user_id=auth.uid()) THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='P0009'; END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=r.schedule_event_id AND organization_id=r.organization_id FOR SHARE NOWAIT;
 IF NOT FOUND OR e.date IS NULL OR e.start_time IS NULL THEN
   RAISE EXCEPTION 'CUSTOMER_CANCELLATION_POLICY_UNAVAILABLE' USING ERRCODE='P0053'; END IF;
 v_type := CASE WHEN r.cancellation_policy_performance_type IN ('open','private') THEN r.cancellation_policy_performance_type
   WHEN r.private_group_id IS NOT NULL OR r.reservation_source='web_private'
     OR e.is_private_booking IS TRUE OR e.category='private' THEN 'private' ELSE 'open' END;
 IF r.cancellation_policy_snapshot_version=1 THEN
   IF r.cancellation_policy_store_id IS NULL OR r.cancellation_policy_performance_type IS NULL
     OR r.cancellation_policy_performance_type NOT IN ('open','private') OR r.cancellation_policy_deadline_hours IS NULL
     OR r.cancellation_policy_fee_basis IS NULL OR r.cancellation_policy_fee_basis NOT IN ('participant_total','performance_total')
     OR r.cancellation_policy_updated_at IS NULL OR jsonb_typeof(r.cancellation_policy_fees) IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'CUSTOMER_CANCELLATION_POLICY_UNAVAILABLE' USING ERRCODE='P0053'; END IF;
   v_deadline:=greatest(0,r.cancellation_policy_deadline_hours);
   v_fees:=r.cancellation_policy_fees;
 ELSE
   v_key:=CASE WHEN r.private_group_id IS NOT NULL OR e.is_private_booking IS TRUE OR e.category='private' THEN 'private_cancellation_deadline_hours' ELSE 'cancellation_deadline_hours' END;
   v_setting:=public.resolve_operating_setting(r.organization_id,v_key,to_jsonb(CASE WHEN v_type='private' THEN 720 ELSE 48 END),NULL,NULL,e.id)->'value';
   IF jsonb_typeof(v_setting) IS DISTINCT FROM 'number' THEN
     RAISE EXCEPTION 'CUSTOMER_CANCELLATION_POLICY_UNAVAILABLE' USING ERRCODE='P0053'; END IF;
   v_deadline:=(v_setting #>> '{}')::numeric;
   IF v_deadline<0 THEN RAISE EXCEPTION 'CUSTOMER_CANCELLATION_POLICY_UNAVAILABLE' USING ERRCODE='P0053'; END IF;
   v_fees:=CASE WHEN v_type='private' THEN '[{"hours_before":168,"fee_percentage":50,"description":"legacy"},{"hours_before":72,"fee_percentage":100,"description":"legacy"},{"hours_before":-1,"fee_percentage":100,"description":"legacy"}]'::jsonb
     ELSE '[{"hours_before":48,"fee_percentage":50,"description":"legacy"},{"hours_before":24,"fee_percentage":100,"description":"legacy"},{"hours_before":-1,"fee_percentage":100,"description":"legacy"}]'::jsonb END;
 END IF;
 -- Existing free self-cancellation semantics: zero uses the default free period.
 IF v_deadline=0 THEN v_deadline:=CASE WHEN v_type='private' THEN 720 ELSE 48 END; END IF;
 FOR v_rule IN SELECT value FROM jsonb_array_elements(v_fees) LOOP
   IF jsonb_typeof(v_rule->'hours_before') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_rule->'fee_percentage') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v_rule->'description') IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION 'CUSTOMER_CANCELLATION_POLICY_UNAVAILABLE' USING ERRCODE='P0053'; END IF;
 END LOOP;
 v_hours:=extract(epoch FROM (((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo')-statement_timestamp()))/3600;
 FOR v_rule IN SELECT value FROM jsonb_array_elements(v_fees) WITH ORDINALITY AS f(value,n) ORDER BY (value->>'hours_before')::numeric DESC,n LOOP
   IF v_hours<=(v_rule->>'hours_before')::numeric THEN v_fee:=(v_rule->>'fee_percentage')::numeric; END IF;
 END LOOP;
 IF v_hours<v_deadline OR greatest(0,least(100,v_fee))<>0 THEN
   RAISE EXCEPTION 'CUSTOMER_CANCELLATION_DEADLINE_OR_FEE' USING ERRCODE='P0052'; END IF;
END $function$;
