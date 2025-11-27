-- =============================================================================
-- RLS（Row Level Security）を全テーブルに設定
-- =============================================================================
-- 
-- 【重要】このマイグレーションを実行する前に：
-- 1. Supabase Dashboard で Service Role Key を確認しておく
-- 2. 管理者アカウントのメールアドレスを確認しておく
-- 3. テスト環境で動作確認後、本番環境に適用する
-- 
-- 【基本方針】
-- - 公開情報（stores, scenarios, schedule_events等）: 誰でも読める、admin のみ書ける
-- - 個人情報（customers, reservations）: 本人 or admin のみアクセス可能
-- - スタッフ情報（staff, shift_submissions等）: スタッフ自身 or admin のみアクセス可能
-- - 設定情報: admin のみアクセス可能
-- 
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ヘルパー関数: 現在のユーザーの役割を取得
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS app_role AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users WHERE id = auth.uid()),
    'customer'::app_role
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- ヘルパー関数: 管理者かどうか
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() = 'admin'::app_role;
$$ LANGUAGE SQL SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- ヘルパー関数: スタッフかどうか
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN AS $$
  SELECT get_user_role() IN ('staff'::app_role, 'admin'::app_role);
$$ LANGUAGE SQL SECURITY DEFINER;

-- =============================================================================
-- 既存のポリシーを削除（競合を避けるため）
-- =============================================================================

DO $$ 
BEGIN
  -- stores
  DROP POLICY IF EXISTS "stores_policy" ON public.stores;
  DROP POLICY IF EXISTS "stores_select_all" ON public.stores;
  DROP POLICY IF EXISTS "stores_insert_admin" ON public.stores;
  DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
  DROP POLICY IF EXISTS "stores_delete_admin" ON public.stores;
  
  -- scenarios
  DROP POLICY IF EXISTS "scenarios_policy" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_select_all" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_insert_admin" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_update_admin" ON public.scenarios;
  DROP POLICY IF EXISTS "scenarios_delete_admin" ON public.scenarios;
  
  -- staff
  DROP POLICY IF EXISTS "staff_policy" ON public.staff;
  DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
  DROP POLICY IF EXISTS "staff_insert_admin" ON public.staff;
  DROP POLICY IF EXISTS "staff_update_self_or_admin" ON public.staff;
  DROP POLICY IF EXISTS "staff_delete_admin" ON public.staff;
  
  -- users
  DROP POLICY IF EXISTS "users_policy" ON public.users;
  DROP POLICY IF EXISTS "users_select_self_or_admin" ON public.users;
  DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
  DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
  DROP POLICY IF EXISTS "users_delete_admin" ON public.users;
  
  -- customers
  DROP POLICY IF EXISTS "customers_policy" ON public.customers;
  DROP POLICY IF EXISTS "customers_select_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_insert_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_update_self_or_admin" ON public.customers;
  DROP POLICY IF EXISTS "customers_delete_admin" ON public.customers;
  
  -- schedule_events
  DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_insert_staff_or_admin" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_update_staff_or_admin" ON public.schedule_events;
  DROP POLICY IF EXISTS "schedule_events_delete_staff_or_admin" ON public.schedule_events;
  
  -- reservations
  DROP POLICY IF EXISTS "reservations_select_self_or_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_insert_self_or_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_update_admin" ON public.reservations;
  DROP POLICY IF EXISTS "reservations_delete_admin" ON public.reservations;
  
  -- shift_submissions
  DROP POLICY IF EXISTS "shift_submissions_self_policy" ON public.shift_submissions;
  DROP POLICY IF EXISTS "shift_submissions_admin_policy" ON public.shift_submissions;
  DROP POLICY IF EXISTS "shift_submissions_select_self_or_admin" ON public.shift_submissions;
  DROP POLICY IF EXISTS "shift_submissions_insert_self_or_admin" ON public.shift_submissions;
  DROP POLICY IF EXISTS "shift_submissions_update_self_or_admin" ON public.shift_submissions;
  DROP POLICY IF EXISTS "shift_submissions_delete_self_or_admin" ON public.shift_submissions;
  
  -- authors
  DROP POLICY IF EXISTS "Authors are viewable by authenticated users with admin or staff role" ON public.authors;
  DROP POLICY IF EXISTS "Authors are insertable by authenticated users with admin or staff role" ON public.authors;
  DROP POLICY IF EXISTS "Authors are updatable by authenticated users with admin or staff role" ON public.authors;
  DROP POLICY IF EXISTS "Authors are deletable by authenticated users with admin role" ON public.authors;
  DROP POLICY IF EXISTS "authors_select_all" ON public.authors;
  DROP POLICY IF EXISTS "authors_insert_admin" ON public.authors;
  DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
  DROP POLICY IF EXISTS "authors_delete_admin" ON public.authors;
  
  -- global_settings
  DROP POLICY IF EXISTS "Anyone can read global settings" ON public.global_settings;
  DROP POLICY IF EXISTS "Authenticated users can update global settings" ON public.global_settings;
  DROP POLICY IF EXISTS "global_settings_select_all" ON public.global_settings;
  DROP POLICY IF EXISTS "global_settings_insert_admin" ON public.global_settings;
  DROP POLICY IF EXISTS "global_settings_update_admin" ON public.global_settings;
  DROP POLICY IF EXISTS "global_settings_delete_admin" ON public.global_settings;
END $$;

-- =============================================================================
-- RLS ポリシー設定
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. stores（店舗情報）
-- 誰でも読める、admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_select_all" ON public.stores
  FOR SELECT
  USING (true);

CREATE POLICY "stores_insert_admin" ON public.stores
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "stores_update_admin" ON public.stores
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "stores_delete_admin" ON public.stores
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 2. scenarios（シナリオ情報）
-- 誰でも読める、admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenarios_select_all" ON public.scenarios
  FOR SELECT
  USING (true);

CREATE POLICY "scenarios_insert_admin" ON public.scenarios
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "scenarios_update_admin" ON public.scenarios
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "scenarios_delete_admin" ON public.scenarios
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 3. staff（スタッフ情報）
-- 誰でも読める（公演情報で GM 名が必要）、自分 or admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_all" ON public.staff
  FOR SELECT
  USING (true);

CREATE POLICY "staff_insert_admin" ON public.staff
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "staff_update_self_or_admin" ON public.staff
  FOR UPDATE
  USING (
    is_admin() OR
    user_id = auth.uid()
  );

CREATE POLICY "staff_delete_admin" ON public.staff
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 4. staff_scenario_assignments（スタッフ⇔シナリオのリレーション）
-- 誰でも読める、admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.staff_scenario_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_scenario_assignments_select_all" ON public.staff_scenario_assignments
  FOR SELECT
  USING (true);

CREATE POLICY "staff_scenario_assignments_insert_admin" ON public.staff_scenario_assignments
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 5. users（ユーザー情報）
-- 自分の情報のみ読み書き可能、admin はすべてアクセス可能
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_self_or_admin" ON public.users
  FOR SELECT
  USING (
    is_admin() OR
    id = auth.uid()
  );

CREATE POLICY "users_insert_admin" ON public.users
  FOR INSERT
  WITH CHECK (is_admin() OR id = auth.uid());

CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    is_admin() OR
    id = auth.uid()
  );

CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 6. customers（顧客情報）
-- 本人 or admin のみアクセス可能【重要】個人情報保護
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_self_or_admin" ON public.customers
  FOR SELECT
  USING (
    is_admin() OR
    user_id = auth.uid()
  );

CREATE POLICY "customers_insert_self_or_admin" ON public.customers
  FOR INSERT
  WITH CHECK (
    is_admin() OR
    user_id = auth.uid()
  );

CREATE POLICY "customers_update_self_or_admin" ON public.customers
  FOR UPDATE
  USING (
    is_admin() OR
    user_id = auth.uid()
  );

CREATE POLICY "customers_delete_admin" ON public.customers
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 7. schedule_events（スケジュール/公演情報）
-- 誰でも読める、staff/admin が書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_events_select_all" ON public.schedule_events
  FOR SELECT
  USING (true);

CREATE POLICY "schedule_events_insert_staff_or_admin" ON public.schedule_events
  FOR INSERT
  WITH CHECK (is_staff_or_admin());

CREATE POLICY "schedule_events_update_staff_or_admin" ON public.schedule_events
  FOR UPDATE
  USING (is_staff_or_admin());

CREATE POLICY "schedule_events_delete_staff_or_admin" ON public.schedule_events
  FOR DELETE
  USING (is_staff_or_admin());

-- -----------------------------------------------------------------------------
-- 8. reservations（予約情報）
-- 自分の予約 or admin のみアクセス可能【重要】個人情報保護
-- -----------------------------------------------------------------------------
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations_select_self_or_admin" ON public.reservations
  FOR SELECT
  USING (
    is_admin() OR
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
  );

CREATE POLICY "reservations_insert_self_or_admin" ON public.reservations
  FOR INSERT
  WITH CHECK (
    is_admin() OR
    customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()) OR
    customer_id IS NULL
  );

CREATE POLICY "reservations_update_admin" ON public.reservations
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "reservations_delete_admin" ON public.reservations
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 9. shift_submissions（シフト提出）
-- 自分のシフト or admin のみアクセス可能
-- -----------------------------------------------------------------------------
ALTER TABLE public.shift_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_submissions_select_self_or_admin" ON public.shift_submissions
  FOR SELECT
  USING (
    is_admin() OR
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "shift_submissions_insert_self_or_admin" ON public.shift_submissions
  FOR INSERT
  WITH CHECK (
    is_admin() OR
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "shift_submissions_update_self_or_admin" ON public.shift_submissions
  FOR UPDATE
  USING (
    is_admin() OR
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "shift_submissions_delete_self_or_admin" ON public.shift_submissions
  FOR DELETE
  USING (
    is_admin() OR
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 10. gm_availability_responses（GM空き状況の回答）
-- staff/admin はすべての回答を見れる、自分 or admin のみ書ける
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gm_availability_responses') THEN
    ALTER TABLE public.gm_availability_responses ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "gm_availability_responses_select_staff_or_admin" ON public.gm_availability_responses
      FOR SELECT
      USING (is_staff_or_admin());
    
    CREATE POLICY "gm_availability_responses_insert_self_or_admin" ON public.gm_availability_responses
      FOR INSERT
      WITH CHECK (
        is_admin() OR
        staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      );
    
    CREATE POLICY "gm_availability_responses_update_self_or_admin" ON public.gm_availability_responses
      FOR UPDATE
      USING (
        is_admin() OR
        staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      );
    
    CREATE POLICY "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses
      FOR DELETE
      USING (
        is_admin() OR
        staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 11. authors（作者情報）
-- 誰でも読める、admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authors_select_all" ON public.authors
  FOR SELECT
  USING (true);

CREATE POLICY "authors_insert_admin" ON public.authors
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "authors_update_admin" ON public.authors
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "authors_delete_admin" ON public.authors
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 12. performance_kits（公演キット）
-- staff/admin のみアクセス可能
-- -----------------------------------------------------------------------------
ALTER TABLE public.performance_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performance_kits_select_staff_or_admin" ON public.performance_kits
  FOR SELECT
  USING (is_staff_or_admin());

CREATE POLICY "performance_kits_insert_admin" ON public.performance_kits
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "performance_kits_update_admin" ON public.performance_kits
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "performance_kits_delete_admin" ON public.performance_kits
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 13. global_settings（全体設定）
-- 誰でも読める、admin のみ書ける
-- -----------------------------------------------------------------------------
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_settings_select_all" ON public.global_settings
  FOR SELECT
  USING (true);

CREATE POLICY "global_settings_insert_admin" ON public.global_settings
  FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "global_settings_update_admin" ON public.global_settings
  FOR UPDATE
  USING (is_admin());

CREATE POLICY "global_settings_delete_admin" ON public.global_settings
  FOR DELETE
  USING (is_admin());

-- -----------------------------------------------------------------------------
-- 14. daily_memos（日別メモ）
-- staff/admin のみアクセス可能
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'daily_memos') THEN
    ALTER TABLE public.daily_memos ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "daily_memos_select_staff_or_admin" ON public.daily_memos
      FOR SELECT
      USING (is_staff_or_admin());
    
    CREATE POLICY "daily_memos_insert_staff_or_admin" ON public.daily_memos
      FOR INSERT
      WITH CHECK (is_staff_or_admin());
    
    CREATE POLICY "daily_memos_update_staff_or_admin" ON public.daily_memos
      FOR UPDATE
      USING (is_staff_or_admin());
    
    CREATE POLICY "daily_memos_delete_staff_or_admin" ON public.daily_memos
      FOR DELETE
      USING (is_staff_or_admin());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 15. miscellaneous_transactions（雑収支）
-- staff/admin のみアクセス可能
-- -----------------------------------------------------------------------------
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'miscellaneous_transactions') THEN
    ALTER TABLE public.miscellaneous_transactions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.miscellaneous_transactions;
    DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.miscellaneous_transactions;
    DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.miscellaneous_transactions;
    DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.miscellaneous_transactions;
    
    CREATE POLICY "miscellaneous_transactions_select_staff_or_admin" ON public.miscellaneous_transactions
      FOR SELECT
      USING (is_staff_or_admin());
    
    CREATE POLICY "miscellaneous_transactions_insert_admin" ON public.miscellaneous_transactions
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "miscellaneous_transactions_delete_admin" ON public.miscellaneous_transactions
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 16-27. 設定系テーブル（admin のみアクセス可能）
-- -----------------------------------------------------------------------------

-- store_basic_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_basic_settings') THEN
    ALTER TABLE public.store_basic_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "store_basic_settings_policy" ON public.store_basic_settings;
    
    CREATE POLICY "store_basic_settings_select_admin" ON public.store_basic_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "store_basic_settings_insert_admin" ON public.store_basic_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "store_basic_settings_update_admin" ON public.store_basic_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "store_basic_settings_delete_admin" ON public.store_basic_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- business_hours_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_hours_settings') THEN
    ALTER TABLE public.business_hours_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "business_hours_settings_policy" ON public.business_hours_settings;
    
    CREATE POLICY "business_hours_settings_select_admin" ON public.business_hours_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "business_hours_settings_insert_admin" ON public.business_hours_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "business_hours_settings_update_admin" ON public.business_hours_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "business_hours_settings_delete_admin" ON public.business_hours_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- performance_schedule_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'performance_schedule_settings') THEN
    ALTER TABLE public.performance_schedule_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "performance_schedule_settings_policy" ON public.performance_schedule_settings;
    
    CREATE POLICY "performance_schedule_settings_select_admin" ON public.performance_schedule_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "performance_schedule_settings_insert_admin" ON public.performance_schedule_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "performance_schedule_settings_update_admin" ON public.performance_schedule_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "performance_schedule_settings_delete_admin" ON public.performance_schedule_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- reservation_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reservation_settings') THEN
    ALTER TABLE public.reservation_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "reservation_settings_policy" ON public.reservation_settings;
    
    CREATE POLICY "reservation_settings_select_admin" ON public.reservation_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "reservation_settings_insert_admin" ON public.reservation_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "reservation_settings_update_admin" ON public.reservation_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "reservation_settings_delete_admin" ON public.reservation_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- pricing_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pricing_settings') THEN
    ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "pricing_settings_policy" ON public.pricing_settings;
    
    CREATE POLICY "pricing_settings_select_admin" ON public.pricing_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "pricing_settings_insert_admin" ON public.pricing_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "pricing_settings_update_admin" ON public.pricing_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "pricing_settings_delete_admin" ON public.pricing_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- email_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_settings') THEN
    ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "email_settings_policy" ON public.email_settings;
    
    CREATE POLICY "email_settings_select_admin" ON public.email_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "email_settings_insert_admin" ON public.email_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "email_settings_update_admin" ON public.email_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "email_settings_delete_admin" ON public.email_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- notification_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_settings') THEN
    ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "notification_settings_policy" ON public.notification_settings;
    
    CREATE POLICY "notification_settings_select_admin" ON public.notification_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "notification_settings_insert_admin" ON public.notification_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "notification_settings_update_admin" ON public.notification_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "notification_settings_delete_admin" ON public.notification_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- staff_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_settings') THEN
    ALTER TABLE public.staff_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "staff_settings_policy" ON public.staff_settings;
    
    CREATE POLICY "staff_settings_select_admin" ON public.staff_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "staff_settings_insert_admin" ON public.staff_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "staff_settings_update_admin" ON public.staff_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "staff_settings_delete_admin" ON public.staff_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- system_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_settings') THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "system_settings_policy" ON public.system_settings;
    
    CREATE POLICY "system_settings_select_admin" ON public.system_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "system_settings_insert_admin" ON public.system_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "system_settings_update_admin" ON public.system_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "system_settings_delete_admin" ON public.system_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- customer_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_settings') THEN
    ALTER TABLE public.customer_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "customer_settings_policy" ON public.customer_settings;
    
    CREATE POLICY "customer_settings_select_admin" ON public.customer_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "customer_settings_insert_admin" ON public.customer_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "customer_settings_update_admin" ON public.customer_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "customer_settings_delete_admin" ON public.customer_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- data_management_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_management_settings') THEN
    ALTER TABLE public.data_management_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "data_management_settings_policy" ON public.data_management_settings;
    
    CREATE POLICY "data_management_settings_select_admin" ON public.data_management_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "data_management_settings_insert_admin" ON public.data_management_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "data_management_settings_update_admin" ON public.data_management_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "data_management_settings_delete_admin" ON public.data_management_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- sales_report_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_report_settings') THEN
    ALTER TABLE public.sales_report_settings ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "sales_report_settings_policy" ON public.sales_report_settings;
    
    CREATE POLICY "sales_report_settings_select_admin" ON public.sales_report_settings
      FOR SELECT
      USING (is_admin());
    
    CREATE POLICY "sales_report_settings_insert_admin" ON public.sales_report_settings
      FOR INSERT
      WITH CHECK (is_admin());
    
    CREATE POLICY "sales_report_settings_update_admin" ON public.sales_report_settings
      FOR UPDATE
      USING (is_admin());
    
    CREATE POLICY "sales_report_settings_delete_admin" ON public.sales_report_settings
      FOR DELETE
      USING (is_admin());
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- コメント
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.get_user_role IS 'ユーザーの役割を取得する関数';
COMMENT ON FUNCTION public.is_admin IS '管理者かどうかを判定する関数';
COMMENT ON FUNCTION public.is_staff_or_admin IS 'スタッフまたは管理者かどうかを判定する関数';

-- =============================================================================
-- 完了
-- =============================================================================
