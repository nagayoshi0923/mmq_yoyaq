-- Relative calendar-month validity is assigned at the database grant boundary,
-- including registration triggers and all API grant routes.
ALTER TABLE public.coupon_campaigns
  ADD COLUMN coupon_expiry_months integer,
  ADD CONSTRAINT coupon_expiry_months_valid CHECK (
    coupon_expiry_months IS NULL OR (
      coupon_expiry_months BETWEEN 1 AND 120
      AND coupon_expiry_days IS NULL
      AND usage_valid_from IS NULL AND usage_valid_until IS NULL
    )
  );
COMMENT ON COLUMN public.coupon_campaigns.coupon_expiry_months IS
  'Grant-relative calendar months in Asia/Tokyo; end-of-month clamps to the last day.';

CREATE FUNCTION public.set_coupon_calendar_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_months integer;
BEGIN
  SELECT coupon_expiry_months INTO v_months
  FROM public.coupon_campaigns WHERE id = NEW.campaign_id;
  IF v_months IS NOT NULL THEN
    NEW.expires_at := ((statement_timestamp() AT TIME ZONE 'Asia/Tokyo')
      + make_interval(months => v_months)) AT TIME ZONE 'Asia/Tokyo';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_coupon_calendar_expiry() FROM PUBLIC;
CREATE TRIGGER set_coupon_calendar_expiry
BEFORE INSERT ON public.customer_coupons
FOR EACH ROW EXECUTE FUNCTION public.set_coupon_calendar_expiry();
