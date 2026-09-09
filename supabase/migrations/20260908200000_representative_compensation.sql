-- One grant per cancelled normal reservation. Coupons and ledger commit together.
CREATE TABLE public.representative_compensation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  campaign_id uuid NOT NULL REFERENCES public.coupon_campaigns(id),
  coupon_ids uuid[] NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,reservation_id),
  CHECK(cardinality(coupon_ids)=quantity)
);
ALTER TABLE public.representative_compensation_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.representative_compensation_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.representative_compensation_grants TO service_role;

CREATE FUNCTION public.grant_representative_compensation(
  p_organization_id uuid,p_reservation_id uuid,p_actor uuid,
  p_apply boolean DEFAULT false,p_expected jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reservations; e public.schedule_events; c public.coupon_campaigns;
  g public.representative_compensation_grants; v_start timestamptz; v_days integer;
  v_amount integer; v_count integer; v_snapshot jsonb; v_ids uuid[] := '{}';
  v_id uuid; v_name text; v_exp timestamptz;
BEGIN
  SELECT * INTO r FROM public.reservations
    WHERE id=p_reservation_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '予約を確認できません'; END IF;
  SELECT * INTO g FROM public.representative_compensation_grants
    WHERE organization_id=p_organization_id AND reservation_id=r.id;
  IF FOUND THEN
    RETURN jsonb_build_object('already_granted',true,'coupon_ids',g.coupon_ids,'quantity',g.quantity);
  END IF;
  SELECT * INTO e FROM public.schedule_events WHERE id=r.schedule_event_id FOR SHARE;
  IF e.id IS NULL OR e.organization_id IS DISTINCT FROM p_organization_id
    OR e.is_cancelled IS DISTINCT FROM true OR e.category IS DISTINCT FROM 'open'
    OR (e.scenario_id IS NULL AND e.scenario_master_id IS NULL AND e.organization_scenario_id IS NULL) THEN
    RAISE EXCEPTION '中止済みの通常マーダーミステリー公演を選択してください';
  END IF;
  IF r.status NOT IN ('confirmed','cancelled','checked_in') OR
    r.cancelled_at < e.cancelled_at OR e.cancelled_at IS NULL THEN
    RAISE EXCEPTION '中止前に取り消された予約、未確定の予約は対象にできません';
  END IF;
  IF r.participant_count IS NULL OR r.participant_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION '予約人数を確認してください'; END IF;
  SELECT name INTO v_name FROM public.customers WHERE id=r.customer_id AND user_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '代表者のMMQアカウントを確認してください'; END IF;
  v_start := coalesce(e.start_at,(e.date + e.start_time) AT TIME ZONE 'Asia/Tokyo');
  IF v_start IS NULL OR e.cancelled_at>v_start THEN RAISE EXCEPTION '中止日時を個別に確認してください'; END IF;
  v_days := (v_start AT TIME ZONE 'Asia/Tokyo')::date - (e.cancelled_at AT TIME ZONE 'Asia/Tokyo')::date;
  v_amount := CASE WHEN v_days=0 THEN CASE WHEN v_start-e.cancelled_at<=interval '2 hours' THEN 5000 ELSE 2000 END
    WHEN v_days=1 THEN 1000 END;
  IF v_amount IS NULL THEN RAISE EXCEPTION '補償額を個別に確認してください'; END IF;
  SELECT count(*) INTO v_count FROM public.coupon_campaigns WHERE organization_id=p_organization_id
    AND is_active AND name LIKE '店舗都合中止のお詫び｜%'
    AND discount_type='fixed' AND discount_amount=v_amount AND coupon_expiry_months=6
    AND murder_mystery_only AND trigger_type='manual' AND max_uses_per_customer=1;
  IF v_count<>1 THEN RAISE EXCEPTION '補償用クーポンを1種類に特定できません'; END IF;
  SELECT * INTO c FROM public.coupon_campaigns WHERE organization_id=p_organization_id
    AND is_active AND name LIKE '店舗都合中止のお詫び｜%'
    AND discount_type='fixed' AND discount_amount=v_amount AND coupon_expiry_months=6
    AND murder_mystery_only AND trigger_type='manual' AND max_uses_per_customer=1 FOR SHARE;
  v_snapshot := jsonb_build_object('reservation_id',r.id,'customer_id',r.customer_id,
    'quantity',r.participant_count,'event_id',e.id,'start',v_start,'cancelled_at',e.cancelled_at,
    'campaign_id',c.id,'amount',v_amount,'customer_name',v_name,'coupon_name',coalesce(c.display_name,c.name));
  IF NOT p_apply THEN RETURN jsonb_build_object('already_granted',false,'snapshot',v_snapshot); END IF;
  IF p_expected IS DISTINCT FROM v_snapshot THEN RAISE EXCEPTION '対象の情報が変わりました。確認画面を開き直してください'; END IF;
  FOR i IN 1..r.participant_count LOOP
    INSERT INTO public.customer_coupons(campaign_id,customer_id,organization_id,uses_remaining,status)
      VALUES(c.id,r.customer_id,p_organization_id,1,'active') RETURNING id,expires_at INTO v_id,v_exp;
    v_ids := array_append(v_ids,v_id);
  END LOOP;
  INSERT INTO public.representative_compensation_grants(organization_id,reservation_id,customer_id,
    campaign_id,coupon_ids,quantity,snapshot,created_by)
    VALUES(p_organization_id,r.id,r.customer_id,c.id,v_ids,r.participant_count,v_snapshot,p_actor);
  RETURN jsonb_build_object('already_granted',false,'coupon_ids',v_ids,'quantity',r.participant_count,'expires_at',v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_representative_compensation(uuid,uuid,uuid,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grant_representative_compensation(uuid,uuid,uuid,boolean,jsonb) TO service_role;
