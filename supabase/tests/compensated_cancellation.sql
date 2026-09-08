-- Staging only. Each scenario and all coupons/notifications are rolled back.
BEGIN;
CREATE FUNCTION pg_temp.test_compensated_cancellation(p_category text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; actor uuid; campaign uuid; a jsonb; b jsonb; bodies jsonb; snapshot jsonb; n integer; link_exp timestamptz;
BEGIN
 SELECT r0.id,r0.organization_id,r0.schedule_event_id,r0.customer_id INTO STRICT r
 FROM public.reservations r0 JOIN public.schedule_events e ON e.id=r0.schedule_event_id
 JOIN public.customers c ON c.id=r0.customer_id
 WHERE c.user_id IS NOT NULL AND e.organization_id=r0.organization_id
 AND (e.scenario_id IS NOT NULL OR e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL)
 AND EXISTS(SELECT 1 FROM public.users u WHERE u.organization_id=r0.organization_id AND u.role='admin') LIMIT 1;
 SELECT id INTO STRICT actor FROM public.users WHERE organization_id=r.organization_id AND role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 UPDATE public.schedule_events SET category=p_category,is_cancelled=false,cancelled_at=NULL,
   start_at=now()+interval '2 days',date=((now()+interval '2 days') AT TIME ZONE 'Asia/Tokyo')::date,
   updated_at=now() WHERE id=r.schedule_event_id;
 UPDATE public.reservations SET status='cancelled',cancelled_at=now()-interval '1 day'
   WHERE schedule_event_id=r.schedule_event_id AND id<>r.id;
 UPDATE public.reservations SET status='confirmed',cancelled_at=NULL,participant_count=2,customer_email='rollback-only@example.invalid' WHERE id=r.id;
 UPDATE public.coupon_campaigns SET is_active=false WHERE organization_id=r.organization_id AND name LIKE '店舗都合中止のお詫び｜%';
 INSERT INTO public.coupon_campaigns(organization_id,name,discount_type,discount_amount,max_uses_per_customer,
   target_type,trigger_type,coupon_expiry_months,murder_mystery_only,notify_on_grant,is_active)
 VALUES(r.organization_id,'店舗都合中止のお詫び｜rollback-only','fixed',5000,1,'all','manual',6,true,false,true) RETURNING id INTO campaign;
 UPDATE public.schedule_events SET start_at=now()+interval '1 hour',date=(now() AT TIME ZONE 'Asia/Tokyo')::date,start_time=((now()+interval '1 hour') AT TIME ZONE 'Asia/Tokyo')::time WHERE id=r.schedule_event_id;
 a:=public.compensated_cancellation(r.schedule_event_id);
 snapshot:=a->'snapshot'; bodies:=jsonb_build_object(r.id::text,'中止のお知らせ（rollback-only）');
 IF (snapshot->>'amount')::integer<>5000 OR jsonb_array_length(snapshot->'recipients')<>1 THEN RAISE EXCEPTION 'preview/exclusion mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.compensated_cancellations WHERE event_id=r.schedule_event_id) THEN RAISE EXCEPTION 'preview mutated'; END IF;
 UPDATE public.reservations SET customer_email='changed@example.invalid' WHERE id=r.id;
 BEGIN
  PERFORM public.compensated_cancellation(r.schedule_event_id,true,snapshot,'GM体調不良',bodies);
  RAISE EXCEPTION 'stale preview accepted' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE '%変わりました%' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.schedule_events WHERE id=r.schedule_event_id AND is_cancelled) THEN RAISE EXCEPTION 'failed apply cancelled event'; END IF;
 UPDATE public.reservations SET customer_email='rollback-only@example.invalid' WHERE id=r.id;
 a:=public.compensated_cancellation(r.schedule_event_id);
 a:=public.compensated_cancellation(r.schedule_event_id,true,a->'snapshot','GM体調不良',bodies);
 b:=public.compensated_cancellation(r.schedule_event_id,true,snapshot,'GM体調不良',bodies);
 IF (a->>'already_completed')::boolean OR NOT (b->>'already_completed')::boolean THEN RAISE EXCEPTION 'replay failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE id=r.schedule_event_id AND is_cancelled AND cancelled_at IS NOT NULL) THEN RAISE EXCEPTION 'event not cancelled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=r.id AND status='cancelled') THEN RAISE EXCEPTION 'reservation not cancelled'; END IF;
 SELECT count(*) INTO n FROM public.compensated_cancellation_notices WHERE event_id=r.schedule_event_id AND status='pending'
   AND compensation_text LIKE '%6か月%' AND compensation_text LIKE '%ボードゲーム%';
 IF n<>1 THEN RAISE EXCEPTION 'one combined notice missing'; END IF;
 SELECT count(*) INTO n FROM public.customer_coupons WHERE campaign_id=campaign;
 IF p_category='open' AND n<>2 THEN RAISE EXCEPTION 'normal quantity mismatch'; END IF;
 IF p_category='private' THEN
  IF n<>0 THEN RAISE EXCEPTION 'private granted to representative'; END IF;
  SELECT expires_at INTO STRICT link_exp FROM public.private_coupon_claim_links WHERE reservation_id=r.id;
  IF link_exp<>((now() AT TIME ZONE 'Asia/Tokyo')+interval '3 months') AT TIME ZONE 'Asia/Tokyo' THEN RAISE EXCEPTION 'private URL expiry mismatch'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.compensated_cancellation_notices WHERE reservation_id=r.id AND compensation_text LIKE '%https://mmq.game/coupon-claim#%') THEN RAISE EXCEPTION 'private link missing'; END IF;
 END IF;
 IF has_table_privilege('authenticated','public.compensated_cancellation_notices','SELECT') THEN RAISE EXCEPTION 'notice leaked'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 BEGIN
  PERFORM public.compensated_cancellation(r.schedule_event_id);
  RAISE EXCEPTION 'unauthorized replay accepted' USING ERRCODE='P0099';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE '%スタッフ権限%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS %: pre-cancellation preview, excluded cancellations, stale rejection, atomic cancellation/compensation/notice, replay, permissions',p_category;
END;
$$;
SAVEPOINT scenario;
SELECT pg_temp.test_compensated_cancellation('open');
ROLLBACK TO scenario;
SELECT pg_temp.test_compensated_cancellation('private');
ROLLBACK;
