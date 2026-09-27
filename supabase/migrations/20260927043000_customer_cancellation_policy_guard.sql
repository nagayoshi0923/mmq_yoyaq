-- Internal guard: call after reservation ownership and before cancellation writes.
CREATE OR REPLACE FUNCTION public.assert_customer_cancellation_policy(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET row_security=off AS $$
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
   WHEN r.private_group_id IS NOT NULL OR r.reservation_source='web_private' THEN 'private' ELSE 'open' END;
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
END $$;
REVOKE ALL ON FUNCTION public.assert_customer_cancellation_policy(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cancel_reservation_and_group_with_lock(p_reservation_id uuid, p_customer_id uuid, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_reservation RECORD;
  v_event_id UUID;
  v_caller_org_id UUID;
  v_actual_participants INTEGER;
  v_group RECORD;
  v_event_is_cancelled BOOLEAN;
  v_event_exists BOOLEAN := FALSE;
BEGIN
  -- 予約をロック（cancel_reservation_with_lock と同じ認可チェック）
  SELECT id, schedule_event_id, status, customer_id, organization_id, private_group_id
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
      WHERE c.id = v_reservation.customer_id
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

  -- 逆順でグループをロックする申込処理と競合した場合は待たずに再試行する。
  IF v_reservation.private_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.private_groups
    WHERE id = v_reservation.private_group_id
      AND organization_id = v_reservation.organization_id
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
    END IF;
    IF v_group.reservation_id IS DISTINCT FROM v_reservation.id THEN
      RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
    END IF;
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT is_cancelled INTO v_event_is_cancelled FROM public.schedule_events
    WHERE id=v_event_id FOR UPDATE NOWAIT;
    v_event_exists := FOUND;
  END IF;

  PERFORM public.assert_customer_cancellation_policy(p_reservation_id);

  -- 予約ステータスを更新
  UPDATE public.reservations
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancellation_reason = p_cancellation_reason,
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 中止公演の人数は保持し、来場済みも有効人数として数える。
  IF v_event_exists AND v_event_is_cancelled IS NOT TRUE THEN
    SELECT COALESCE(SUM(participant_count), 0) INTO v_actual_participants
    FROM public.reservations WHERE schedule_event_id=v_event_id
      AND status IN ('pending','confirmed','gm_confirmed','checked_in');
    UPDATE public.schedule_events
    SET current_participants=v_actual_participants,updated_at=NOW()
    WHERE id=v_event_id;
  END IF;

  -- 貸切グループが紐づいている場合、同一トランザクションでキャンセル
  IF v_reservation.private_group_id IS NOT NULL THEN
    UPDATE public.private_groups
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = v_reservation.private_group_id
      AND organization_id = v_reservation.organization_id
      AND reservation_id = v_reservation.id
      AND status != 'cancelled';
  END IF;

  RETURN TRUE;
END;
$function$;
