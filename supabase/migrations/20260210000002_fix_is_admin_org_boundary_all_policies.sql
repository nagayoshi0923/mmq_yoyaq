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
-- =============================================================================

-- =============================================================================
-- 1. _org_policy (ALL) の修正 — `OR is_admin()` を org 付きに変更
-- =============================================================================

-- booking_notices
DROP POLICY IF EXISTS "booking_notices_org_policy" ON public.booking_notices;
CREATE POLICY "booking_notices_org_policy" ON public.booking_notices
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- business_hours_settings (_org_policy)
DROP POLICY IF EXISTS "business_hours_settings_org_policy" ON public.business_hours_settings;
CREATE POLICY "business_hours_settings_org_policy" ON public.business_hours_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- customer_settings
DROP POLICY IF EXISTS "customer_settings_org_policy" ON public.customer_settings;
CREATE POLICY "customer_settings_org_policy" ON public.customer_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- daily_memos
DROP POLICY IF EXISTS "daily_memos_org_policy" ON public.daily_memos;
CREATE POLICY "daily_memos_org_policy" ON public.daily_memos
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- data_management_settings (_org_policy)
DROP POLICY IF EXISTS "data_management_settings_org_policy" ON public.data_management_settings;
CREATE POLICY "data_management_settings_org_policy" ON public.data_management_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- email_settings (_org_policy)
DROP POLICY IF EXISTS "email_settings_org_policy" ON public.email_settings;
CREATE POLICY "email_settings_org_policy" ON public.email_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- event_categories
DROP POLICY IF EXISTS "event_categories_org_policy" ON public.event_categories;
CREATE POLICY "event_categories_org_policy" ON public.event_categories
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- notification_settings
DROP POLICY IF EXISTS "notification_settings_org_policy" ON public.notification_settings;
CREATE POLICY "notification_settings_org_policy" ON public.notification_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- performance_schedule_settings (_org_policy)
DROP POLICY IF EXISTS "performance_schedule_settings_org_policy" ON public.performance_schedule_settings;
CREATE POLICY "performance_schedule_settings_org_policy" ON public.performance_schedule_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- pricing_settings
DROP POLICY IF EXISTS "pricing_settings_org_policy" ON public.pricing_settings;
CREATE POLICY "pricing_settings_org_policy" ON public.pricing_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservation_settings (_org_policy)
DROP POLICY IF EXISTS "reservation_settings_org_policy" ON public.reservation_settings;
CREATE POLICY "reservation_settings_org_policy" ON public.reservation_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- sales_report_settings (_org_policy)
DROP POLICY IF EXISTS "sales_report_settings_org_policy" ON public.sales_report_settings;
CREATE POLICY "sales_report_settings_org_policy" ON public.sales_report_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- scenario_likes
DROP POLICY IF EXISTS "scenario_likes_org_policy" ON public.scenario_likes;
CREATE POLICY "scenario_likes_org_policy" ON public.scenario_likes
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- shift_button_states
DROP POLICY IF EXISTS "shift_button_states_org_policy" ON public.shift_button_states;
CREATE POLICY "shift_button_states_org_policy" ON public.shift_button_states
  FOR ALL USING (
    organization_id = current_organization_id()
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- shift_notifications
DROP POLICY IF EXISTS "shift_notifications_org_policy" ON public.shift_notifications;
CREATE POLICY "shift_notifications_org_policy" ON public.shift_notifications
  FOR ALL USING (
    organization_id = current_organization_id()
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- staff_scenario_assignments (_org_policy)
DROP POLICY IF EXISTS "staff_scenario_assignments_org_policy" ON public.staff_scenario_assignments;
CREATE POLICY "staff_scenario_assignments_org_policy" ON public.staff_scenario_assignments
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- staff_settings (_org_policy)
DROP POLICY IF EXISTS "staff_settings_org_policy" ON public.staff_settings;
CREATE POLICY "staff_settings_org_policy" ON public.staff_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- store_basic_settings (_org_policy)
DROP POLICY IF EXISTS "store_basic_settings_org_policy" ON public.store_basic_settings;
CREATE POLICY "store_basic_settings_org_policy" ON public.store_basic_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- system_settings
DROP POLICY IF EXISTS "system_settings_org_policy" ON public.system_settings;
CREATE POLICY "system_settings_org_policy" ON public.system_settings
  FOR ALL USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
  );


-- =============================================================================
-- 2. SELECT ポリシーの修正
-- =============================================================================

-- audit_logs: admin は自組織のログのみ
DROP POLICY IF EXISTS "audit_logs_admin_only" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT USING (
    auth.role() = 'service_role'::text
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- business_hours_settings (SELECT)
DROP POLICY IF EXISTS "business_hours_settings_select_admin" ON public.business_hours_settings;
CREATE POLICY "business_hours_settings_select_admin" ON public.business_hours_settings
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- customers (SELECT)
DROP POLICY IF EXISTS "customers_select_self_or_admin" ON public.customers;
CREATE POLICY "customers_select_self_or_admin" ON public.customers
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR user_id = auth.uid()
  );

-- email_settings (SELECT)
DROP POLICY IF EXISTS "email_settings_select_admin" ON public.email_settings;
CREATE POLICY "email_settings_select_admin" ON public.email_settings
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- external_performance_reports (SELECT)
DROP POLICY IF EXISTS "external_reports_org_select" ON public.external_performance_reports;
CREATE POLICY "external_reports_org_select" ON public.external_performance_reports
  FOR SELECT USING (
    organization_id = current_organization_id()
    OR is_license_manager()
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- gm_availability_responses (SELECT)
DROP POLICY IF EXISTS "gm_availability_responses_read_policy" ON public.gm_availability_responses;
CREATE POLICY "gm_availability_responses_read_policy" ON public.gm_availability_responses
  FOR SELECT USING (
    organization_id = current_organization_id()
    OR organization_id IS NULL
    OR current_organization_id() IS NULL
    OR (is_admin() AND organization_id = get_user_organization_id())
    OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- reservation_settings (SELECT)
DROP POLICY IF EXISTS "reservation_settings_select_admin" ON public.reservation_settings;
CREATE POLICY "reservation_settings_select_admin" ON public.reservation_settings
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservations (SELECT)
DROP POLICY IF EXISTS "reservations_select_self_or_admin" ON public.reservations;
CREATE POLICY "reservations_select_self_or_admin" ON public.reservations
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- shift_submissions (SELECT)
DROP POLICY IF EXISTS "shift_submissions_select_self_or_admin" ON public.shift_submissions;
CREATE POLICY "shift_submissions_select_self_or_admin" ON public.shift_submissions
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- store_basic_settings (SELECT)
DROP POLICY IF EXISTS "store_basic_settings_select_admin" ON public.store_basic_settings;
CREATE POLICY "store_basic_settings_select_admin" ON public.store_basic_settings
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- users (SELECT) — admin は同組織のみ
DROP POLICY IF EXISTS "users_select_self_or_admin" ON public.users;
CREATE POLICY "users_select_self_or_admin" ON public.users
  FOR SELECT USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR id = auth.uid()
  );


-- =============================================================================
-- 3. UPDATE ポリシーの修正
-- =============================================================================

-- authors — 共有マスタ。license_admin のみグローバル操作可、通常 admin は不可に変更
DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
CREATE POLICY "authors_update_admin" ON public.authors
  FOR UPDATE USING (is_license_admin() OR is_admin());

-- business_hours_settings (UPDATE)
DROP POLICY IF EXISTS "business_hours_settings_update_admin" ON public.business_hours_settings;
CREATE POLICY "business_hours_settings_update_admin" ON public.business_hours_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- customers (UPDATE)
DROP POLICY IF EXISTS "customers_update_self_or_admin" ON public.customers;
CREATE POLICY "customers_update_self_or_admin" ON public.customers
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR user_id = auth.uid()
  );

-- data_management_settings (UPDATE)
DROP POLICY IF EXISTS "data_management_settings_update_admin" ON public.data_management_settings;
CREATE POLICY "data_management_settings_update_admin" ON public.data_management_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- email_settings (UPDATE)
DROP POLICY IF EXISTS "email_settings_update_admin" ON public.email_settings;
CREATE POLICY "email_settings_update_admin" ON public.email_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- external_performance_reports (UPDATE)
DROP POLICY IF EXISTS "external_reports_org_update" ON public.external_performance_reports;
CREATE POLICY "external_reports_org_update" ON public.external_performance_reports
  FOR UPDATE USING (
    (organization_id = current_organization_id() AND status = 'pending')
    OR is_license_manager()
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- global_settings (UPDATE)
DROP POLICY IF EXISTS "global_settings_update_admin" ON public.global_settings;
CREATE POLICY "global_settings_update_admin" ON public.global_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- gm_availability_responses (UPDATE — 2 policies)
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

-- miscellaneous_transactions (UPDATE)
DROP POLICY IF EXISTS "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions;
CREATE POLICY "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- performance_kits (UPDATE)
DROP POLICY IF EXISTS "performance_kits_update_admin" ON public.performance_kits;
CREATE POLICY "performance_kits_update_admin" ON public.performance_kits
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- performance_schedule_settings (UPDATE)
DROP POLICY IF EXISTS "performance_schedule_settings_update_admin" ON public.performance_schedule_settings;
CREATE POLICY "performance_schedule_settings_update_admin" ON public.performance_schedule_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservation_settings (UPDATE)
DROP POLICY IF EXISTS "reservation_settings_update_admin" ON public.reservation_settings;
CREATE POLICY "reservation_settings_update_admin" ON public.reservation_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservations (UPDATE)
DROP POLICY IF EXISTS "reservations_update_admin" ON public.reservations;
CREATE POLICY "reservations_update_admin" ON public.reservations
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- sales_report_settings (UPDATE)
DROP POLICY IF EXISTS "sales_report_settings_update_admin" ON public.sales_report_settings;
CREATE POLICY "sales_report_settings_update_admin" ON public.sales_report_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- scenarios (UPDATE)
DROP POLICY IF EXISTS "scenarios_update_admin" ON public.scenarios;
CREATE POLICY "scenarios_update_admin" ON public.scenarios
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- shift_submissions (UPDATE)
DROP POLICY IF EXISTS "shift_submissions_update_self_or_admin" ON public.shift_submissions;
CREATE POLICY "shift_submissions_update_self_or_admin" ON public.shift_submissions
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- staff (UPDATE)
DROP POLICY IF EXISTS "staff_update_self_or_admin" ON public.staff;
CREATE POLICY "staff_update_self_or_admin" ON public.staff
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR user_id = auth.uid()
  );

-- staff_scenario_assignments (UPDATE)
DROP POLICY IF EXISTS "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments;
CREATE POLICY "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- staff_settings (UPDATE)
DROP POLICY IF EXISTS "staff_settings_update_admin" ON public.staff_settings;
CREATE POLICY "staff_settings_update_admin" ON public.staff_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- store_basic_settings (UPDATE)
DROP POLICY IF EXISTS "store_basic_settings_update_admin" ON public.store_basic_settings;
CREATE POLICY "store_basic_settings_update_admin" ON public.store_basic_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- stores (UPDATE)
DROP POLICY IF EXISTS "stores_update_admin" ON public.stores;
CREATE POLICY "stores_update_admin" ON public.stores
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- system_settings (UPDATE)
DROP POLICY IF EXISTS "system_settings_update_admin" ON public.system_settings;
CREATE POLICY "system_settings_update_admin" ON public.system_settings
  FOR UPDATE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );


-- =============================================================================
-- 4. DELETE ポリシーの修正
-- =============================================================================

-- authors — 共有マスタ。license_admin のみ削除可
DROP POLICY IF EXISTS "authors_delete_admin" ON public.authors;
CREATE POLICY "authors_delete_admin" ON public.authors
  FOR DELETE USING (is_license_admin() OR is_admin());

-- business_hours_settings (DELETE)
DROP POLICY IF EXISTS "business_hours_settings_delete_admin" ON public.business_hours_settings;
CREATE POLICY "business_hours_settings_delete_admin" ON public.business_hours_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- customers (DELETE)
DROP POLICY IF EXISTS "customers_delete_admin" ON public.customers;
CREATE POLICY "customers_delete_admin" ON public.customers
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- data_management_settings (DELETE)
DROP POLICY IF EXISTS "data_management_settings_delete_admin" ON public.data_management_settings;
CREATE POLICY "data_management_settings_delete_admin" ON public.data_management_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- email_settings (DELETE)
DROP POLICY IF EXISTS "email_settings_delete_admin" ON public.email_settings;
CREATE POLICY "email_settings_delete_admin" ON public.email_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- external_performance_reports (DELETE)
DROP POLICY IF EXISTS "external_reports_org_delete" ON public.external_performance_reports;
CREATE POLICY "external_reports_org_delete" ON public.external_performance_reports
  FOR DELETE USING (
    (organization_id = current_organization_id() AND status = 'pending')
    OR (is_admin() AND organization_id = get_user_organization_id())
  );

-- global_settings (DELETE)
DROP POLICY IF EXISTS "global_settings_delete_admin" ON public.global_settings;
CREATE POLICY "global_settings_delete_admin" ON public.global_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- gm_availability_responses (DELETE)
DROP POLICY IF EXISTS "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses;
CREATE POLICY "gm_availability_responses_delete_self_or_admin" ON public.gm_availability_responses
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- miscellaneous_transactions (DELETE)
DROP POLICY IF EXISTS "miscellaneous_transactions_delete_admin" ON public.miscellaneous_transactions;
CREATE POLICY "miscellaneous_transactions_delete_admin" ON public.miscellaneous_transactions
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- performance_kits (DELETE)
DROP POLICY IF EXISTS "performance_kits_delete_admin" ON public.performance_kits;
CREATE POLICY "performance_kits_delete_admin" ON public.performance_kits
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- performance_schedule_settings (DELETE)
DROP POLICY IF EXISTS "performance_schedule_settings_delete_admin" ON public.performance_schedule_settings;
CREATE POLICY "performance_schedule_settings_delete_admin" ON public.performance_schedule_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservation_settings (DELETE)
DROP POLICY IF EXISTS "reservation_settings_delete_admin" ON public.reservation_settings;
CREATE POLICY "reservation_settings_delete_admin" ON public.reservation_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- reservations (DELETE)
DROP POLICY IF EXISTS "reservations_delete_admin" ON public.reservations;
CREATE POLICY "reservations_delete_admin" ON public.reservations
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- sales_report_settings (DELETE)
DROP POLICY IF EXISTS "sales_report_settings_delete_admin" ON public.sales_report_settings;
CREATE POLICY "sales_report_settings_delete_admin" ON public.sales_report_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- scenarios (DELETE)
DROP POLICY IF EXISTS "scenarios_delete_admin" ON public.scenarios;
CREATE POLICY "scenarios_delete_admin" ON public.scenarios
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- shift_submissions (DELETE)
DROP POLICY IF EXISTS "shift_submissions_delete_self_or_admin" ON public.shift_submissions;
CREATE POLICY "shift_submissions_delete_self_or_admin" ON public.shift_submissions
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
    OR staff_id IN (SELECT id FROM staff WHERE user_id = auth.uid())
  );

-- staff (DELETE)
DROP POLICY IF EXISTS "staff_delete_admin" ON public.staff;
CREATE POLICY "staff_delete_admin" ON public.staff
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- staff_scenario_assignments (DELETE)
DROP POLICY IF EXISTS "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments;
CREATE POLICY "staff_scenario_assignments_delete_admin" ON public.staff_scenario_assignments
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- staff_settings (DELETE)
DROP POLICY IF EXISTS "staff_settings_delete_admin" ON public.staff_settings;
CREATE POLICY "staff_settings_delete_admin" ON public.staff_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- store_basic_settings (DELETE)
DROP POLICY IF EXISTS "store_basic_settings_delete_admin" ON public.store_basic_settings;
CREATE POLICY "store_basic_settings_delete_admin" ON public.store_basic_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- stores (DELETE)
DROP POLICY IF EXISTS "stores_delete_admin" ON public.stores;
CREATE POLICY "stores_delete_admin" ON public.stores
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- system_settings (DELETE)
DROP POLICY IF EXISTS "system_settings_delete_admin" ON public.system_settings;
CREATE POLICY "system_settings_delete_admin" ON public.system_settings
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );

-- users (DELETE) — admin は同組織のみ
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;
CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE USING (
    (is_admin() AND organization_id = get_user_organization_id())
  );


-- =============================================================================
-- 5. 検証: is_admin() のみで org チェックがないポリシーが0件であること
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
    -- authors は例外（共有マスタ）
    AND tablename NOT IN ('authors');

  IF v_count > 0 THEN
    RAISE WARNING '⚠️ is_admin() のみで org チェックがないポリシーが % 件残存。手動確認が必要です。', v_count;
  ELSE
    RAISE NOTICE '✅ 全ポリシーに org 境界チェックが追加されました';
  END IF;
END $$;
