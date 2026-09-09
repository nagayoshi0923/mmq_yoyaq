-- Staging only. Every fixture is rolled back; no email endpoint is invoked.
BEGIN;
DO $$
DECLARE v_org uuid; v_customer uuid; v_res uuid; v_campaign uuid; v_coupon uuid; v_exp timestamptz;
BEGIN
  IF timestamp '2026-08-31 12:00' + interval '6 months' <> timestamp '2027-02-28 12:00'
    OR timestamp '2023-08-31 12:00' + interval '6 months' <> timestamp '2024-02-29 12:00' THEN
    RAISE EXCEPTION 'Calendar-month clamp failed';
  END IF;
  IF NOT public.is_murder_mystery_coupon_event('open',true)
    OR NOT public.is_murder_mystery_coupon_event('private',true)
    OR public.is_murder_mystery_coupon_event('package',true)
    OR public.is_murder_mystery_coupon_event('venue_rental',true)
    OR public.is_murder_mystery_coupon_event('open',false)
    OR public.is_murder_mystery_coupon_event(NULL,true) THEN
    RAISE EXCEPTION 'Performance eligibility failed';
  END IF;
  SELECT r.organization_id,r.customer_id,r.id INTO STRICT v_org,v_customer,v_res
  FROM public.reservations r JOIN public.schedule_events e ON e.id=r.schedule_event_id
  WHERE r.customer_id IS NOT NULL AND e.organization_id=r.organization_id
    AND public.is_murder_mystery_coupon_event(e.category,
      e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL OR e.scenario_id IS NOT NULL)
  LIMIT 1;
  INSERT INTO public.coupon_campaigns(organization_id,name,discount_type,discount_amount,
    max_uses_per_customer,target_type,trigger_type,coupon_expiry_months,murder_mystery_only,notify_on_grant)
  VALUES(v_org,'rollback-only compensation test','fixed',5000,1,'all','manual',6,true,false)
  RETURNING id INTO v_campaign;
  INSERT INTO public.customer_coupons(campaign_id,customer_id,organization_id,uses_remaining,expires_at,status)
  VALUES(v_campaign,v_customer,v_org,1,'2099-01-01','active') RETURNING id,expires_at INTO v_coupon,v_exp;
  IF v_exp <> ((statement_timestamp() AT TIME ZONE 'Asia/Tokyo') + interval '6 months') AT TIME ZONE 'Asia/Tokyo' THEN
    RAISE EXCEPTION 'Grant expiry not enforced';
  END IF;
  BEGIN
    INSERT INTO public.coupon_usages(customer_coupon_id,discount_amount) VALUES(v_coupon,5000);
    RAISE EXCEPTION 'Missing reservation accepted';
  EXCEPTION WHEN SQLSTATE 'P0028' THEN NULL;
  END;
  INSERT INTO public.coupon_usages(customer_coupon_id,reservation_id,discount_amount)
    VALUES(v_coupon,v_res,5000);
  RAISE NOTICE 'PASS: calendar months, leap year, eligible categories, missing scenario/reservation, actual grant and use';
END;
$$;
ROLLBACK;
