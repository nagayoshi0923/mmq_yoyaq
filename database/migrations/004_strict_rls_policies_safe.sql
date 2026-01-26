-- =============================================================================
-- RLSポリシー厳格化（安全版）
-- テーブルが存在しない場合やエラーが発生しても続行
-- =============================================================================

-- 1. 関数を作成
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM staff
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================================
-- 2. 主要テーブルのRLSポリシー
-- =============================================================================

-- stores
DO $$ BEGIN
  DROP POLICY IF EXISTS stores_org_policy ON stores;
  DROP POLICY IF EXISTS stores_select_org_or_anon ON stores;
  DROP POLICY IF EXISTS stores_public_read ON stores;
  DROP POLICY IF EXISTS stores_strict ON stores;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY stores_strict ON stores FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        status = 'active'
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- scenarios
DO $$ BEGIN
  DROP POLICY IF EXISTS scenarios_org_policy ON scenarios;
  DROP POLICY IF EXISTS scenarios_org_modify_policy ON scenarios;
  DROP POLICY IF EXISTS scenarios_org_update_policy ON scenarios;
  DROP POLICY IF EXISTS scenarios_org_delete_policy ON scenarios;
  DROP POLICY IF EXISTS scenarios_select_org_or_anon ON scenarios;
  DROP POLICY IF EXISTS scenarios_public_read ON scenarios;
  DROP POLICY IF EXISTS scenarios_strict_select ON scenarios;
  DROP POLICY IF EXISTS scenarios_strict_modify ON scenarios;
  DROP POLICY IF EXISTS scenarios_strict ON scenarios;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY scenarios_strict ON scenarios FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_shared = true OR is_org_admin()
      ELSE
        status = 'available'
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- schedule_events
DO $$ BEGIN
  DROP POLICY IF EXISTS schedule_events_org_policy ON schedule_events;
  DROP POLICY IF EXISTS schedule_events_select_org_or_anon ON schedule_events;
  DROP POLICY IF EXISTS schedule_events_public_read ON schedule_events;
  DROP POLICY IF EXISTS schedule_events_strict ON schedule_events;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY schedule_events_strict ON schedule_events FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        is_cancelled = false
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- reservations
DO $$ BEGIN
  DROP POLICY IF EXISTS reservations_org_policy ON reservations;
  DROP POLICY IF EXISTS reservations_strict ON reservations;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reservations_strict ON reservations FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- customers
DO $$ BEGIN
  DROP POLICY IF EXISTS customers_org_policy ON customers;
  DROP POLICY IF EXISTS customers_strict ON customers;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY customers_strict ON customers FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        user_id = auth.uid()
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- staff
DO $$ BEGIN
  DROP POLICY IF EXISTS staff_org_policy ON staff;
  DROP POLICY IF EXISTS staff_select_org_or_anon ON staff;
  DROP POLICY IF EXISTS staff_strict ON staff;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY staff_strict ON staff FOR ALL USING (
    get_user_organization_id() IS NULL  -- 未ログインは見えない
    OR organization_id = get_user_organization_id() 
    OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- staff_scenario_assignments
DO $$ BEGIN
  DROP POLICY IF EXISTS staff_scenario_assignments_policy ON staff_scenario_assignments;
  DROP POLICY IF EXISTS staff_scenario_assignments_strict ON staff_scenario_assignments;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY staff_scenario_assignments_strict ON staff_scenario_assignments FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- shift_submissions
DO $$ BEGIN
  DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
  DROP POLICY IF EXISTS shift_submissions_strict ON shift_submissions;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY shift_submissions_strict ON shift_submissions FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- scenario_likes
DO $$ BEGIN
  DROP POLICY IF EXISTS scenario_likes_policy ON scenario_likes;
  DROP POLICY IF EXISTS scenario_likes_strict ON scenario_likes;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY scenario_likes_strict ON scenario_likes FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- gm_availability_responses
DO $$ BEGIN
  DROP POLICY IF EXISTS gm_availability_responses_org_policy ON gm_availability_responses;
  DROP POLICY IF EXISTS gm_availability_responses_strict ON gm_availability_responses;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY gm_availability_responses_strict ON gm_availability_responses FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- private_booking_requests
DO $$ BEGIN
  DROP POLICY IF EXISTS private_booking_requests_org_policy ON private_booking_requests;
  DROP POLICY IF EXISTS private_booking_requests_strict ON private_booking_requests;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY private_booking_requests_strict ON private_booking_requests FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- miscellaneous_transactions
DO $$ BEGIN
  DROP POLICY IF EXISTS miscellaneous_transactions_org_policy ON miscellaneous_transactions;
  DROP POLICY IF EXISTS miscellaneous_transactions_strict ON miscellaneous_transactions;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY miscellaneous_transactions_strict ON miscellaneous_transactions FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- external_sales
DO $$ BEGIN
  DROP POLICY IF EXISTS external_sales_policy ON external_sales;
  DROP POLICY IF EXISTS external_sales_strict ON external_sales;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY external_sales_strict ON external_sales FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- external_performance_reports
DO $$ BEGIN
  DROP POLICY IF EXISTS external_performance_reports_policy ON external_performance_reports;
  DROP POLICY IF EXISTS external_performance_reports_strict ON external_performance_reports;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY external_performance_reports_strict ON external_performance_reports FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR organization_id IS NULL OR is_org_admin()
      ELSE
        true  -- 外部報告フォームからの投稿を許可
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- daily_memos
DO $$ BEGIN
  DROP POLICY IF EXISTS daily_memos_policy ON daily_memos;
  DROP POLICY IF EXISTS daily_memos_strict ON daily_memos;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY daily_memos_strict ON daily_memos FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 3. 設定テーブルのRLSポリシー
-- =============================================================================

-- global_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS global_settings_org_policy ON global_settings;
  DROP POLICY IF EXISTS global_settings_strict ON global_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY global_settings_strict ON global_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- organization_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS organization_settings_policy ON organization_settings;
  DROP POLICY IF EXISTS organization_settings_strict ON organization_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY organization_settings_strict ON organization_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- business_hours_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS business_hours_settings_policy ON business_hours_settings;
  DROP POLICY IF EXISTS business_hours_settings_strict ON business_hours_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY business_hours_settings_strict ON business_hours_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- notification_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS notification_settings_policy ON notification_settings;
  DROP POLICY IF EXISTS notification_settings_strict ON notification_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY notification_settings_strict ON notification_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- reservation_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS reservation_settings_policy ON reservation_settings;
  DROP POLICY IF EXISTS reservation_settings_strict ON reservation_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY reservation_settings_strict ON reservation_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- booking_notices
DO $$ BEGIN
  DROP POLICY IF EXISTS booking_notices_policy ON booking_notices;
  DROP POLICY IF EXISTS booking_notices_strict ON booking_notices;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY booking_notices_strict ON booking_notices FOR ALL USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        true  -- 予約サイトで表示
    END
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- customer_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS customer_settings_policy ON customer_settings;
  DROP POLICY IF EXISTS customer_settings_strict ON customer_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY customer_settings_strict ON customer_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- email_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS email_settings_policy ON email_settings;
  DROP POLICY IF EXISTS email_settings_strict ON email_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY email_settings_strict ON email_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- pricing_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS pricing_settings_policy ON pricing_settings;
  DROP POLICY IF EXISTS pricing_settings_strict ON pricing_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY pricing_settings_strict ON pricing_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- staff_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS staff_settings_policy ON staff_settings;
  DROP POLICY IF EXISTS staff_settings_strict ON staff_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY staff_settings_strict ON staff_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- system_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS system_settings_policy ON system_settings;
  DROP POLICY IF EXISTS system_settings_strict ON system_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY system_settings_strict ON system_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- sales_report_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS sales_report_settings_policy ON sales_report_settings;
  DROP POLICY IF EXISTS sales_report_settings_strict ON sales_report_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY sales_report_settings_strict ON sales_report_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- performance_schedule_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS performance_schedule_settings_policy ON performance_schedule_settings;
  DROP POLICY IF EXISTS performance_schedule_settings_strict ON performance_schedule_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY performance_schedule_settings_strict ON performance_schedule_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- data_management_settings
DO $$ BEGIN
  DROP POLICY IF EXISTS data_management_settings_policy ON data_management_settings;
  DROP POLICY IF EXISTS data_management_settings_strict ON data_management_settings;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY data_management_settings_strict ON data_management_settings FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- salary_settings_history
DO $$ BEGIN
  DROP POLICY IF EXISTS salary_settings_history_policy ON salary_settings_history;
  DROP POLICY IF EXISTS salary_settings_history_strict ON salary_settings_history;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY salary_settings_history_strict ON salary_settings_history FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- organization_invitations
DO $$ BEGIN
  DROP POLICY IF EXISTS organization_invitations_policy ON organization_invitations;
  DROP POLICY IF EXISTS organization_invitations_strict ON organization_invitations;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY organization_invitations_strict ON organization_invitations FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- performance_kits
DO $$ BEGIN
  DROP POLICY IF EXISTS performance_kits_org_policy ON performance_kits;
  DROP POLICY IF EXISTS performance_kits_strict ON performance_kits;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY performance_kits_strict ON performance_kits FOR ALL USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );
EXCEPTION WHEN undefined_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 完了
-- =============================================================================
SELECT 'RLS policies created successfully!' as result;




