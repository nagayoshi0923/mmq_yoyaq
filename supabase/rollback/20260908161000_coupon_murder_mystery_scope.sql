-- Disable restricted campaigns before rollback to avoid unrestricted use.
DROP TRIGGER IF EXISTS enforce_coupon_performance_scope ON public.coupon_usages;
DROP FUNCTION IF EXISTS public.enforce_coupon_performance_scope();
DROP FUNCTION IF EXISTS public.is_murder_mystery_coupon_event(text, boolean);
ALTER TABLE public.coupon_campaigns DROP COLUMN IF EXISTS murder_mystery_only;
