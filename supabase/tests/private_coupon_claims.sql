-- Run only on staging; all fixtures are rolled back and no email endpoint is called.
BEGIN;
DO $$
DECLARE r record; v_campaign uuid; v_link uuid; u1 uuid; u2 uuid;
  a jsonb; b jsonb; n integer; v_exp timestamptz;
BEGIN
  SELECT r0.id,r0.organization_id,r0.schedule_event_id INTO STRICT r
  FROM public.reservations r0 JOIN public.schedule_events e ON r0.schedule_event_id=e.id
  WHERE e.is_cancelled AND e.category='private' AND e.organization_id=r0.organization_id LIMIT 1;
  SELECT c.user_id INTO STRICT u1 FROM public.customers c JOIN auth.users u ON c.user_id=u.id
    WHERE u.email_confirmed_at IS NOT NULL LIMIT 1;
  SELECT c.user_id INTO STRICT u2 FROM public.customers c JOIN auth.users u ON c.user_id=u.id
    WHERE u.email_confirmed_at IS NOT NULL AND c.user_id<>u1 LIMIT 1;
  INSERT INTO public.coupon_campaigns(organization_id,name,discount_type,discount_amount,
    max_uses_per_customer,target_type,trigger_type,coupon_expiry_months,murder_mystery_only,notify_on_grant,is_active)
  VALUES(r.organization_id,'rollback-only claim test','fixed',5000,1,'all','manual',6,true,false,true)
  RETURNING id INTO v_campaign;
  INSERT INTO public.private_coupon_claim_links(organization_id,reservation_id,event_id,campaign_id,token,max_claims,created_by,discount_amount)
    VALUES(r.organization_id,r.id,r.schedule_event_id,v_campaign,repeat('a',64),1,u1,5000)
    RETURNING id,expires_at INTO v_link,v_exp;
  IF v_exp<>((now() AT TIME ZONE 'Asia/Tokyo')+interval '3 months') AT TIME ZONE 'Asia/Tokyo' THEN
    RAISE EXCEPTION 'URL expiry is not three calendar months'; END IF;
  a:=public.claim_private_compensation_coupon(repeat('a',64),u1);
  b:=public.claim_private_compensation_coupon(repeat('a',64),u1);
  IF (a->>'already_claimed')::boolean OR NOT (b->>'already_claimed')::boolean OR a->>'coupon_id'<>b->>'coupon_id' THEN
    RAISE EXCEPTION 'Duplicate claim was not idempotent'; END IF;
  SELECT count(*) INTO n FROM public.customer_coupons WHERE campaign_id=v_campaign;
  IF n<>1 THEN RAISE EXCEPTION 'Duplicate coupon'; END IF;
  IF (a->>'expires_at')::timestamptz<>((statement_timestamp() AT TIME ZONE 'Asia/Tokyo')+interval '6 months') AT TIME ZONE 'Asia/Tokyo' THEN
    RAISE EXCEPTION 'Coupon expiry is not six months from claim'; END IF;
  BEGIN
    PERFORM public.claim_private_compensation_coupon(repeat('a',64),u2);
    RAISE EXCEPTION 'capacity accepted' USING ERRCODE='P0099';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%予約人数分%' THEN RAISE; END IF;
  END;
  UPDATE public.private_coupon_claim_links SET expires_at=now()-interval '1 second' WHERE id=v_link;
  BEGIN
    PERFORM public.claim_private_compensation_coupon(repeat('a',64),u2);
    RAISE EXCEPTION 'expired link accepted' USING ERRCODE='P0099';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM NOT LIKE '%有効期限%' THEN RAISE; END IF;
  END;
  IF has_table_privilege('authenticated','public.private_coupon_claim_links','SELECT') OR
    has_function_privilege('authenticated','public.claim_private_compensation_coupon(text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Link or claim privileges leaked'; END IF;
  RAISE NOTICE 'PASS: one account/one coupon, capacity, URL 3 months, coupon 6 months, expired URL, restricted privileges';
END;
$$;
ROLLBACK;
