-- =============================================================================
-- P0-B 追加修正: 全テーブルの is_admin() に組織境界チェックを追加
-- 
-- 問題: is_admin() は role のみチェックし、organization_id を見ない
-- 影響: 他組織の admin が全データを読み書き削除可能
-- 修正: is_admin() → (is_admin() AND organization_id = get_user_organization_id())
--
-- 例外:
-- - authors: 共有マスタデータ（組織横断で管理する設計）
-- - audit_logs: admin は自組織のみ閲覧可能に変更
--
-- 注意: テーブル/カラムが存在しない場合はスキップ（ローカル db reset 対応）
-- =============================================================================

-- ヘルパー: テーブルとカラムが存在するか
CREATE OR REPLACE FUNCTION pg_temp.tbl_has_org(p_table text)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=p_table AND column_name='organization_id'
  );
$$;

-- =============================================================================
-- 1. _org_policy (ALL) の修正 — `OR is_admin()` を org 付きに変更
-- =============================================================================
DO $$
DECLARE
  t text;
  tables_org text[] := ARRAY[
    'booking_notices', 'business_hours_settings', 'customer_settings', 'daily_memos',
    'data_management_settings', 'email_settings', 'event_categories', 'notification_settings',
    'performance_schedule_settings', 'pricing_settings', 'reservation_settings', 'sales_report_settings',
    'scenario_likes', 'shift_button_states', 'shift_notifications', 'staff_scenario_assignments',
    'staff_settings', 'store_basic_settings', 'system_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables_org
  LOOP
    IF pg_temp.tbl_has_org(t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_policy', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (
          organization_id = get_user_organization_id()
          OR organization_id IS NULL
          OR get_user_organization_id() IS NULL
          OR (is_admin() AND organization_id = get_user_organization_id())
        )', t || '_org_policy', t
      );
    END IF;
  END LOOP;
END $$;

-- shift_button_states, shift_notifications: 個別ポリシー（NULL fallback なし）
DO $$
BEGIN
  IF pg_temp.tbl_has_org('shift_button_states') THEN
    DROP POLICY IF EXISTS "shift_button_states_org_policy" ON public.shift_button_states;
    CREATE POLICY "shift_button_states_org_policy" ON public.shift_button_states
      FOR ALL USING (
        organization_id = get_user_organization_id()
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
  END IF;
  IF pg_temp.tbl_has_org('shift_notifications') THEN
    DROP POLICY IF EXISTS "shift_notifications_org_policy" ON public.shift_notifications;
    CREATE POLICY "shift_notifications_org_policy" ON public.shift_notifications
      FOR ALL USING (
        organization_id = get_user_organization_id()
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
  END IF;
END $$;

-- =============================================================================
-- 2. SELECT ポリシーの修正（動的 SQL で存在チェック付き）
-- =============================================================================
DO $$
DECLARE
  t text;
  -- (table, policy_name, using_clause) の配列を使う代わりに個別処理
BEGIN
  -- audit_logs
  IF pg_temp.tbl_has_org('audit_logs') THEN
    DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;
    CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
      FOR SELECT USING (auth.role() = 'service_role'::text OR (is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- business_hours_settings
  IF pg_temp.tbl_has_org('business_hours_settings') THEN
    DROP POLICY IF EXISTS "business_hours_settings_select_admin" ON public.business_hours_settings;
    CREATE POLICY "business_hours_settings_select_admin" ON public.business_hours_settings
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- customers
  IF pg_temp.tbl_has_org('customers') THEN
    DROP POLICY IF EXISTS "customers_select_self_or_admin" ON public.customers;
    CREATE POLICY "customers_select_self_or_admin" ON public.customers
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()) OR user_id = auth.uid());
  END IF;

  -- email_settings
  IF pg_temp.tbl_has_org('email_settings') THEN
    DROP POLICY IF EXISTS "email_settings_select_admin" ON public.email_settings;
    CREATE POLICY "email_settings_select_admin" ON public.email_settings
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- external_performance_reports
  IF pg_temp.tbl_has_org('external_performance_reports') THEN
    DROP POLICY IF EXISTS "external_reports_org_select" ON public.external_performance_reports;
    CREATE POLICY "external_reports_org_select" ON public.external_performance_reports
      FOR SELECT USING (
        organization_id = get_user_organization_id()
        OR is_license_manager()
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
  END IF;

  -- gm_availability_responses
  IF pg_temp.tbl_has_org('gm_availability_responses') THEN
    DROP POLICY IF EXISTS "gm_availability_responses_read_policy" ON public.gm_availability_responses;
    CREATE POLICY "gm_availability_responses_read_policy" ON public.gm_availability_responses
      FOR SELECT USING (
        organization_id = get_user_organization_id()
        OR organization_id IS NULL
        OR get_user_organization_id() IS NULL
        OR (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;

  -- reservation_settings
  IF pg_temp.tbl_has_org('reservation_settings') THEN
    DROP POLICY IF EXISTS "reservation_settings_select_admin" ON public.reservation_settings;
    CREATE POLICY "reservation_settings_select_admin" ON public.reservation_settings
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- reservations
  IF pg_temp.tbl_has_org('reservations') THEN
    DROP POLICY IF EXISTS "reservations_select_self_or_admin" ON public.reservations;
    CREATE POLICY "reservations_select_self_or_admin" ON public.reservations
      FOR SELECT USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
      );
  END IF;

  -- shift_submissions
  IF pg_temp.tbl_has_org('shift_submissions') THEN
    DROP POLICY IF EXISTS "shift_submissions_select_self_or_admin" ON public.shift_submissions;
    CREATE POLICY "shift_submissions_select_self_or_admin" ON public.shift_submissions
      FOR SELECT USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;

  -- store_basic_settings
  IF pg_temp.tbl_has_org('store_basic_settings') THEN
    DROP POLICY IF EXISTS "store_basic_settings_select_admin" ON public.store_basic_settings;
    CREATE POLICY "store_basic_settings_select_admin" ON public.store_basic_settings
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- users
  IF pg_temp.tbl_has_org('users') THEN
    DROP POLICY IF EXISTS "users_select_self_or_admin" ON public.users;
    CREATE POLICY "users_select_self_or_admin" ON public.users
      FOR SELECT USING ((is_admin() AND organization_id = get_user_organization_id()) OR id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- 3. UPDATE ポリシーの修正
-- =============================================================================
DO $$
DECLARE
  -- 単純な admin+org チェックのテーブル一覧
  t text;
  simple_update text[] := ARRAY[
    'business_hours_settings', 'data_management_settings', 'email_settings',
    'global_settings', 'performance_kits', 'performance_schedule_settings',
    'reservation_settings', 'reservations', 'sales_report_settings',
    'scenarios', 'staff_scenario_assignments', 'staff_settings',
    'store_basic_settings', 'stores', 'system_settings'
  ];
BEGIN
  -- authors: 共有マスタ（org チェック不要）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='authors') THEN
    DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
    CREATE POLICY "authors_update_admin" ON public.authors
      FOR UPDATE USING (is_license_admin() OR is_admin());
  END IF;

  -- 単純 admin+org テーブル
  FOREACH t IN ARRAY simple_update
  LOOP
    IF pg_temp.tbl_has_org(t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_admin', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (is_admin() AND organization_id = get_user_organization_id())',
        t || '_update_admin', t
      );
    END IF;
  END LOOP;

  -- customers (UPDATE): admin+org OR self
  IF pg_temp.tbl_has_org('customers') THEN
    DROP POLICY IF EXISTS "customers_update_self_or_admin" ON public.customers;
    CREATE POLICY "customers_update_self_or_admin" ON public.customers
      FOR UPDATE USING ((is_admin() AND organization_id = get_user_organization_id()) OR user_id = auth.uid());
  END IF;

  -- external_performance_reports (UPDATE)
  IF pg_temp.tbl_has_org('external_performance_reports') THEN
    DROP POLICY IF EXISTS "external_reports_org_update" ON public.external_performance_reports;
    CREATE POLICY "external_reports_org_update" ON public.external_performance_reports
      FOR UPDATE USING (
        (organization_id = get_user_organization_id() AND status = 'pending')
        OR is_license_manager()
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
  END IF;

  -- gm_availability_responses (UPDATE)
  IF pg_temp.tbl_has_org('gm_availability_responses') THEN
    DROP POLICY IF EXISTS "gm_availability_responses_update_policy" ON public.gm_availability_responses;
    CREATE POLICY "gm_availability_responses_update_policy" ON public.gm_availability_responses
      FOR UPDATE USING (
        staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
    DROP POLICY IF EXISTS "gm_availability_responses_update_self_or_admin" ON public.gm_availability_responses;
    CREATE POLICY "gm_availability_responses_update_self_or_admin" ON public.gm_availability_responses
      FOR UPDATE USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;

  -- miscellaneous_transactions (UPDATE)
  IF pg_temp.tbl_has_org('miscellaneous_transactions') THEN
    DROP POLICY IF EXISTS "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions;
    CREATE POLICY "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions
      FOR UPDATE USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- shift_submissions (UPDATE)
  IF pg_temp.tbl_has_org('shift_submissions') THEN
    DROP POLICY IF EXISTS "shift_submissions_update_self_or_admin" ON public.shift_submissions;
    CREATE POLICY "shift_submissions_update_self_or_admin" ON public.shift_submissions
      FOR UPDATE USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;

  -- staff (UPDATE)
  IF pg_temp.tbl_has_org('staff') THEN
    DROP POLICY IF EXISTS "staff_update_self_or_admin" ON public.staff;
    CREATE POLICY "staff_update_self_or_admin" ON public.staff
      FOR UPDATE USING ((is_admin() AND organization_id = get_user_organization_id()) OR user_id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- 4. DELETE ポリシーの修正
-- =============================================================================
DO $$
DECLARE
  t text;
  simple_delete text[] := ARRAY[
    'business_hours_settings', 'customers', 'data_management_settings', 'email_settings',
    'global_settings', 'performance_kits', 'performance_schedule_settings',
    'reservation_settings', 'reservations', 'sales_report_settings',
    'scenarios', 'staff', 'staff_scenario_assignments', 'staff_settings',
    'store_basic_settings', 'stores', 'system_settings', 'users'
  ];
BEGIN
  -- authors: 共有マスタ
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='authors') THEN
    DROP POLICY IF EXISTS "authors_delete_admin" ON public.authors;
    CREATE POLICY "authors_delete_admin" ON public.authors
      FOR DELETE USING (is_license_admin() OR is_admin());
  END IF;

  -- 単純 admin+org テーブル
  FOREACH t IN ARRAY simple_delete
  LOOP
    IF pg_temp.tbl_has_org(t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_admin', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (is_admin() AND organization_id = get_user_organization_id())',
        t || '_delete_admin', t
      );
    END IF;
  END LOOP;

  -- external_performance_reports (DELETE)
  IF pg_temp.tbl_has_org('external_performance_reports') THEN
    DROP POLICY IF EXISTS "external_reports_org_delete" ON public.external_performance_reports;
    CREATE POLICY "external_reports_org_delete" ON public.external_performance_reports
      FOR DELETE USING (
        (organization_id = get_user_organization_id() AND status = 'pending')
        OR (is_admin() AND organization_id = get_user_organization_id())
      );
  END IF;

  -- gm_availability_responses (DELETE)
  IF pg_temp.tbl_has_org('gm_availability_responses') THEN
    DROP POLICY IF EXISTS "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses;
    CREATE POLICY "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses
      FOR DELETE USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;

  -- miscellaneous_transactions (DELETE)
  IF pg_temp.tbl_has_org('miscellaneous_transactions') THEN
    DROP POLICY IF EXISTS "miscellaneous_transactions_delete_admin" ON public.miscellaneous_transactions;
    CREATE POLICY "miscellaneous_transactions_delete_admin" ON public.miscellaneous_transactions
      FOR DELETE USING ((is_admin() AND organization_id = get_user_organization_id()));
  END IF;

  -- shift_submissions (DELETE)
  IF pg_temp.tbl_has_org('shift_submissions') THEN
    DROP POLICY IF EXISTS "shift_submissions_delete_self_or_admin" ON public.shift_submissions;
    CREATE POLICY "shift_submissions_delete_self_or_admin" ON public.shift_submissions
      FOR DELETE USING (
        (is_admin() AND organization_id = get_user_organization_id())
        OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- =============================================================================
-- 5. stores テーブルの SELECT ポリシーを修正
-- =============================================================================
DO $$
BEGIN
  IF pg_temp.tbl_has_org('stores') THEN
    DROP POLICY IF EXISTS "stores_public_read" ON public.stores;
    DROP POLICY IF EXISTS "Allow anon read active stores" ON public.stores;
    DROP POLICY IF EXISTS "stores_select_org_or_anon" ON public.stores;
    DROP POLICY IF EXISTS "stores_strict" ON public.stores;

    CREATE POLICY "stores_select_policy" ON public.stores
      FOR SELECT USING (
        CASE
          WHEN auth.uid() IS NULL THEN status = 'active'
          ELSE organization_id = get_user_organization_id()
               OR (is_admin() AND organization_id = get_user_organization_id())
        END
      );
  END IF;
END $$;

-- =============================================================================
-- 6. organization_id カラムがないが store_id/staff_id 経由で org 境界を確保するテーブル
-- =============================================================================

-- store_basic_settings: store_id → stores.organization_id で間接チェック
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='store_basic_settings')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='store_basic_settings' AND column_name='store_id')
  THEN
    -- SELECT
    DROP POLICY IF EXISTS "store_basic_settings_select_admin" ON public.store_basic_settings;
    CREATE POLICY "store_basic_settings_select_admin" ON public.store_basic_settings
      FOR SELECT USING (
        is_admin() AND store_id IN (SELECT id FROM stores WHERE organization_id = get_user_organization_id())
      );
    -- UPDATE
    DROP POLICY IF EXISTS "store_basic_settings_update_admin" ON public.store_basic_settings;
    CREATE POLICY "store_basic_settings_update_admin" ON public.store_basic_settings
      FOR UPDATE USING (
        is_admin() AND store_id IN (SELECT id FROM stores WHERE organization_id = get_user_organization_id())
      );
    -- DELETE
    DROP POLICY IF EXISTS "store_basic_settings_delete_admin" ON public.store_basic_settings;
    CREATE POLICY "store_basic_settings_delete_admin" ON public.store_basic_settings
      FOR DELETE USING (
        is_admin() AND store_id IN (SELECT id FROM stores WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

-- staff_scenario_assignments: staff_id → staff.organization_id で間接チェック
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_scenario_assignments')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_scenario_assignments' AND column_name='staff_id')
  THEN
    -- UPDATE
    DROP POLICY IF EXISTS "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments;
    CREATE POLICY "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments
      FOR UPDATE USING (
        is_admin() AND staff_id IN (SELECT id FROM staff WHERE organization_id = get_user_organization_id())
      );
    -- DELETE
    DROP POLICY IF EXISTS "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments;
    CREATE POLICY "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments
      FOR DELETE USING (
        is_admin() AND staff_id IN (SELECT id FROM staff WHERE organization_id = get_user_organization_id())
      );
  END IF;
END $$;

-- =============================================================================
-- 7. 検証: is_admin() のみで org チェックがないポリシーが 0 件であること
-- =============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual::text ILIKE '%is_admin%'
    AND qual::text NOT ILIKE '%organization_id%'
    AND qual::text NOT ILIKE '%get_user_organization_id%'
    AND qual::text NOT ILIKE '%current_organization_id%'
    AND tablename NOT IN ('authors');

  IF v_count > 0 THEN
    RAISE WARNING '⚠️ is_admin() のみで org チェックがないポリシーが % 件残存。手動確認が必要です。', v_count;
  ELSE
    RAISE NOTICE '✅ 全ポリシーに org 境界チェックが追加されました';
  END IF;
END $$;
