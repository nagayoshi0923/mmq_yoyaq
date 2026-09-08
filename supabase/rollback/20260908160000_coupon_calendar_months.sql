-- Existing granted expires_at values remain intact. Stop month-based grants
-- before rolling back; this removes campaign month settings.
DROP TRIGGER IF EXISTS set_coupon_calendar_expiry ON public.customer_coupons;
DROP FUNCTION IF EXISTS public.set_coupon_calendar_expiry();
ALTER TABLE public.coupon_campaigns DROP COLUMN IF EXISTS coupon_expiry_months;
