-- DEBUG: create_reservation_with_lock_v2 のシグネチャを確認
-- 500エラーの原因調査用

-- 1. 関数のオーバーロード確認
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'create_reservation_with_lock_v2'
ORDER BY p.oid;

-- 期待する結果:
-- 10引数版のみが存在すること:
-- p_schedule_event_id uuid, p_participant_count integer, p_customer_id uuid, 
-- p_customer_name text, p_customer_email text, p_customer_phone text, 
-- p_notes text DEFAULT NULL::text, p_how_found text DEFAULT NULL::text, 
-- p_reservation_number text DEFAULT NULL::text, p_customer_coupon_id uuid DEFAULT NULL::uuid

-- 2. coupon_usages テーブルの存在確認
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'coupon_usages'
) AS coupon_usages_exists;

-- 3. reservations.coupon_usage_id カラムの存在確認
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'reservations' 
    AND column_name = 'coupon_usage_id'
) AS coupon_usage_id_exists;

-- 4. coupon_usages のRLSポリシー確認
SELECT 
  policyname,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'coupon_usages';

-- 5. coupon_campaigns テーブルの存在確認
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'coupon_campaigns'
) AS coupon_campaigns_exists;

-- 6. customer_coupons テーブルの存在確認
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'customer_coupons'
) AS customer_coupons_exists;
