-- =============================================================================
-- Part B: 主要テーブルの RLS ポリシー
-- =============================================================================

-- 1. stores（店舗情報）
DROP POLICY IF EXISTS stores_org_policy ON stores;
DROP POLICY IF EXISTS stores_select_org_or_anon ON stores;
DROP POLICY IF EXISTS stores_public_read ON stores;
DROP POLICY IF EXISTS stores_strict ON stores;

CREATE POLICY stores_strict ON stores FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      status = 'active'
  END
);

-- 2. scenarios（シナリオ情報）
DROP POLICY IF EXISTS scenarios_org_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_modify_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_update_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_delete_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_select_org_or_anon ON scenarios;
DROP POLICY IF EXISTS scenarios_public_read ON scenarios;
DROP POLICY IF EXISTS scenarios_strict_select ON scenarios;
DROP POLICY IF EXISTS scenarios_strict_modify ON scenarios;

CREATE POLICY scenarios_strict_select ON scenarios FOR SELECT USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_shared = true OR is_org_admin()
    ELSE
      status = 'available'
  END
);

-- 3. schedule_events（スケジュールイベント）
DROP POLICY IF EXISTS schedule_events_org_policy ON schedule_events;
DROP POLICY IF EXISTS schedule_events_select_org_or_anon ON schedule_events;
DROP POLICY IF EXISTS schedule_events_public_read ON schedule_events;
DROP POLICY IF EXISTS schedule_events_strict ON schedule_events;

CREATE POLICY schedule_events_strict ON schedule_events FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      is_cancelled = false
  END
);

-- 4. reservations（予約情報）
DROP POLICY IF EXISTS reservations_org_policy ON reservations;
DROP POLICY IF EXISTS reservations_strict ON reservations;

CREATE POLICY reservations_strict ON reservations FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      -- 顧客: 自分の予約のみ
      customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
  END
);

-- 5. customers（顧客情報）
DROP POLICY IF EXISTS customers_org_policy ON customers;
DROP POLICY IF EXISTS customers_strict ON customers;

CREATE POLICY customers_strict ON customers FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      user_id = auth.uid()
  END
);

-- 6. staff（スタッフ情報）
DROP POLICY IF EXISTS staff_org_policy ON staff;
DROP POLICY IF EXISTS staff_select_org_or_anon ON staff;
DROP POLICY IF EXISTS staff_strict ON staff;

CREATE POLICY staff_strict ON staff FOR ALL USING (
  organization_id = get_user_organization_id() OR is_org_admin()
);

SELECT 'Main table policies created successfully' as result;




