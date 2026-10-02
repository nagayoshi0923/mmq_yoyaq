-- rollback: 金額を退避表から戻し、関数を 20260927150100 / 20260926100000 時点の定義に戻す。
UPDATE public.reservations r
SET total_price = b.total_price, discount_amount = b.discount_amount, final_price = b.final_price
FROM archive.reservations_amount_backup_20261002 b WHERE b.reservation_id = r.id;
-- 関数の旧定義は supabase/migrations/20260927150100_customer_last_visit.sql（get_org_customers_with_stats_v2）と
-- supabase/migrations/20260926100000_unify_coupon_rules.sql（use_customer_coupon）を再適用する。
