-- Staging only. No email invocation; all fixture changes and grants roll back.
BEGIN;
DO $$
DECLARE r record; v_campaign uuid; a jsonb; b jsonb; v_snapshot jsonb; n integer;
BEGIN
  SELECT r0.id,r0.organization_id,r0.schedule_event_id,c.user_id INTO STRICT r
    FROM public.reservations r0 JOIN public.schedule_events e ON e.id=r0.schedule_event_id
    JOIN public.customers c ON c.id=r0.customer_id
    WHERE e.is_cancelled AND e.category='open' AND c.user_id IS NOT NULL
    AND (e.scenario_id IS NOT NULL OR e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL)
    AND e.organization_id=r0.organization_id LIMIT 1;
  UPDATE public.schedule_events SET cancelled_at=coalesce(start_at,(date+start_time) AT TIME ZONE 'Asia/Tokyo')-interval '2 hours'
    WHERE id=r.schedule_event_id;
  UPDATE public.reservations SET status='cancelled',cancelled_at=NULL,participant_count=3 WHERE id=r.id;
  UPDATE public.coupon_campaigns SET is_active=false WHERE organization_id=r.organization_id AND name LIKE '店舗都合中止のお詫び｜%';
  INSERT INTO public.coupon_campaigns(organization_id,name,discount_type,discount_amount,max_uses_per_customer,
    target_type,trigger_type,coupon_expiry_months,murder_mystery_only,notify_on_grant,is_active)
    VALUES(r.organization_id,'店舗都合中止のお詫び｜rollback-only','fixed',5000,1,'all','manual',6,true,false,true)
    RETURNING id INTO v_campaign;
  a:=public.grant_representative_compensation(r.organization_id,r.id,r.user_id);
  v_snapshot:=a->'snapshot';
  IF (v_snapshot->>'amount')::integer<>5000 OR (v_snapshot->>'quantity')::integer<>3 THEN RAISE EXCEPTION 'preview mismatch'; END IF;
  SELECT count(*) INTO n FROM public.customer_coupons WHERE campaign_id=v_campaign;
  IF n<>0 THEN RAISE EXCEPTION 'preview created coupons'; END IF;
  BEGIN
    PERFORM public.grant_representative_compensation(gen_random_uuid(),r.id,r.user_id);
    RAISE EXCEPTION 'cross org accepted' USING ERRCODE='P0099';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
  UPDATE public.reservations SET participant_count=4 WHERE id=r.id;
  BEGIN
    PERFORM public.grant_representative_compensation(r.organization_id,r.id,r.user_id,true,v_snapshot);
    RAISE EXCEPTION 'stale snapshot accepted' USING ERRCODE='P0099';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%情報が変わりました%' THEN RAISE; END IF;
  END;
  UPDATE public.reservations SET participant_count=3 WHERE id=r.id;
  a:=public.grant_representative_compensation(r.organization_id,r.id,r.user_id,true,v_snapshot);
  b:=public.grant_representative_compensation(r.organization_id,r.id,r.user_id,true,v_snapshot);
  IF (a->>'already_granted')::boolean OR NOT (b->>'already_granted')::boolean OR a->'coupon_ids'<>b->'coupon_ids' THEN RAISE EXCEPTION 'not idempotent'; END IF;
  SELECT count(*) INTO n FROM public.customer_coupons WHERE campaign_id=v_campaign AND uses_remaining=1
    AND expires_at=((statement_timestamp() AT TIME ZONE 'Asia/Tokyo')+interval '6 months') AT TIME ZONE 'Asia/Tokyo';
  IF n<>3 THEN RAISE EXCEPTION 'quantity, uses or expiry mismatch'; END IF;
  IF has_table_privilege('authenticated','public.representative_compensation_grants','SELECT') OR
    has_function_privilege('authenticated','public.grant_representative_compensation(uuid,uuid,uuid,boolean,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'privileges leaked'; END IF;
  RAISE NOTICE 'PASS: preview, exact 2h=5000, quantity=3, stale preview rejection, tenant isolation, replay, 6-month expiry, privileges';
END;
$$;
ROLLBACK;
