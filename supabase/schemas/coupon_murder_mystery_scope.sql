ALTER TABLE public.coupon_campaigns
  ADD COLUMN murder_mystery_only boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.coupon_campaigns.murder_mystery_only IS
  'Only open/private performances with a registered scenario; excludes package and venue rental events.';

CREATE FUNCTION public.is_murder_mystery_coupon_event(p_category text, p_has_scenario boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(p_category IN ('open', 'private') AND p_has_scenario, false);
$$;

CREATE FUNCTION public.enforce_coupon_performance_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_restricted boolean; v_org uuid;
BEGIN
  SELECT c.murder_mystery_only, c.organization_id INTO v_restricted, v_org
  FROM public.customer_coupons cc
  JOIN public.coupon_campaigns c ON c.id=cc.campaign_id
  WHERE cc.id=NEW.customer_coupon_id;
  IF v_restricted AND NOT EXISTS (
    SELECT 1 FROM public.reservations r
    JOIN public.schedule_events e ON e.id=r.schedule_event_id
    WHERE r.id=NEW.reservation_id AND r.organization_id=v_org
      AND e.organization_id=v_org
      AND public.is_murder_mystery_coupon_event(e.category,
        e.scenario_master_id IS NOT NULL OR e.organization_scenario_id IS NOT NULL OR e.scenario_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'COUPON_NOT_APPLICABLE: このクーポンはマーダーミステリーの通常公演・貸切のみで利用できます（ボードゲーム・箱開け会は対象外）'
      USING ERRCODE='P0028';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_coupon_performance_scope() FROM PUBLIC;
CREATE TRIGGER enforce_coupon_performance_scope
BEFORE INSERT OR UPDATE OF customer_coupon_id, reservation_id ON public.coupon_usages
FOR EACH ROW EXECUTE FUNCTION public.enforce_coupon_performance_scope();
