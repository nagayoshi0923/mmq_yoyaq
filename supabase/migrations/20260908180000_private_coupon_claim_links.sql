CREATE TABLE public.private_coupon_claim_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id),
  event_id uuid NOT NULL REFERENCES public.schedule_events(id),
  campaign_id uuid NOT NULL REFERENCES public.coupon_campaigns(id),
  token text NOT NULL UNIQUE CHECK (length(token)=64),
  discount_amount integer NOT NULL CHECK (discount_amount > 0),
  max_claims integer NOT NULL CHECK (max_claims BETWEEN 1 AND 100),
  revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (((now() AT TIME ZONE 'Asia/Tokyo') + interval '3 months') AT TIME ZONE 'Asia/Tokyo'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,reservation_id)
);
CREATE TABLE public.private_coupon_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.private_coupon_claim_links(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  event_id uuid NOT NULL REFERENCES public.schedule_events(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  customer_coupon_id uuid NOT NULL REFERENCES public.customer_coupons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,event_id,user_id)
);
ALTER TABLE public.private_coupon_claim_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_coupon_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_coupon_claim_links, public.private_coupon_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.private_coupon_claim_links, public.private_coupon_claims TO service_role;

CREATE FUNCTION public.claim_private_compensation_coupon(p_token text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.private_coupon_claim_links; c public.coupon_campaigns;
  v_customer uuid; v_coupon uuid; v_exp timestamptz; v_count integer;
BEGIN
  SELECT * INTO l FROM public.private_coupon_claim_links WHERE token=p_token;
  IF NOT FOUND THEN RAISE EXCEPTION '受け取りURLが無効です'; END IF;
  -- Serialize the same account across links as well as simultaneous claims at capacity.
  PERFORM pg_advisory_xact_lock(hashtextextended(l.organization_id::text||l.event_id::text||p_user_id::text,0));
  SELECT * INTO l FROM public.private_coupon_claim_links WHERE id=l.id FOR UPDATE;
  SELECT customer_coupon_id INTO v_coupon FROM public.private_coupon_claims
    WHERE organization_id=l.organization_id AND event_id=l.event_id AND user_id=p_user_id;
  IF FOUND THEN
    SELECT expires_at INTO v_exp FROM public.customer_coupons WHERE id=v_coupon;
    RETURN jsonb_build_object('already_claimed',true,'coupon_id',v_coupon,'expires_at',v_exp);
  END IF;
  IF l.expires_at <= now() THEN RAISE EXCEPTION '受け取りURLの有効期限が過ぎています'; END IF;
  IF l.revoked THEN RAISE EXCEPTION 'このURLでの受け取りは終了しました'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'メールアドレスの確認を完了してください';
  END IF;
  SELECT id INTO v_customer FROM public.customers WHERE user_id=p_user_id ORDER BY created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'プロフィール登録を完了してください'; END IF;
  SELECT * INTO c FROM public.coupon_campaigns WHERE id=l.campaign_id FOR SHARE;
  IF c.organization_id IS DISTINCT FROM l.organization_id OR NOT c.is_active
    OR c.coupon_expiry_months IS DISTINCT FROM 6 OR NOT c.murder_mystery_only
    OR c.discount_type <> 'fixed' OR c.discount_amount <> l.discount_amount
    OR c.max_uses_per_customer <> 1 THEN
    RAISE EXCEPTION '現在このクーポンは受け取れません';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.schedule_events WHERE id=l.event_id
    AND organization_id=l.organization_id AND is_cancelled) THEN
    RAISE EXCEPTION '公演の中止状態を確認できません';
  END IF;
  SELECT count(*) INTO v_count FROM public.private_coupon_claims WHERE link_id=l.id;
  IF v_count>=l.max_claims THEN RAISE EXCEPTION '予約人数分のクーポンはすべて受け取り済みです'; END IF;
  INSERT INTO public.customer_coupons(campaign_id,customer_id,organization_id,uses_remaining,status)
    VALUES(c.id,v_customer,l.organization_id,1,'active') RETURNING id,expires_at INTO v_coupon,v_exp;
  INSERT INTO public.private_coupon_claims(link_id,organization_id,event_id,user_id,customer_coupon_id)
    VALUES(l.id,l.organization_id,l.event_id,p_user_id,v_coupon);
  RETURN jsonb_build_object('already_claimed',false,'coupon_id',v_coupon,'expires_at',v_exp);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_private_compensation_coupon(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_private_compensation_coupon(text,uuid) TO service_role;
