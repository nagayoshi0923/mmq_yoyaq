-- 既定権限で付与された過剰GRANTの剥奪（RLS対象外のTRUNCATE等を含む多層防御）
-- テンプレ: 20260630130000_create_customer_played_overrides.sql
REVOKE ALL ON public.store_travel_times FROM anon;
REVOKE ALL ON public.store_scenario_license_contracts FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.customer_memos FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.store_travel_times FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.store_scenario_license_contracts FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.coupon_campaigns FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.customer_coupons FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.coupon_usages FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.manual_play_history FROM authenticated;
