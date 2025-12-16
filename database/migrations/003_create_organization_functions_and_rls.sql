-- マルチテナント対応: 組織判定関数とRLSポリシー
-- 実行日: 2024-12-17
--
-- 【重要】このマイグレーションは以下の順序で実行すること:
-- 1. 001_create_organizations_table.sql
-- 2. 002_add_organization_id_to_tables.sql
-- 3. このファイル (003_create_organization_functions_and_rls.sql)

-- ================================================
-- 1. 現在のユーザーの organization_id を取得する関数
-- ================================================
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  -- staff テーブルから organization_id を取得
  SELECT organization_id INTO org_id
  FROM staff
  WHERE user_id = auth.uid()
  LIMIT 1;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ================================================
-- 2. ユーザーが管理者かどうかを判定する関数
-- ================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ================================================
-- 3. ユーザーがライセンス管理組織に所属しているかを判定
-- ================================================
CREATE OR REPLACE FUNCTION is_license_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff s
    JOIN organizations o ON s.organization_id = o.id
    WHERE s.user_id = auth.uid()
    AND o.is_license_manager = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ================================================
-- 4. 既存のRLSポリシーを削除して再作成
-- ================================================

-- stores テーブル
DROP POLICY IF EXISTS stores_policy ON stores;
DROP POLICY IF EXISTS stores_org_policy ON stores;
CREATE POLICY stores_org_policy ON stores FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- staff テーブル
DROP POLICY IF EXISTS staff_policy ON staff;
DROP POLICY IF EXISTS staff_org_policy ON staff;
CREATE POLICY staff_org_policy ON staff FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- scenarios テーブル
-- 共有シナリオ（managed）は全組織から閲覧可能
DROP POLICY IF EXISTS scenarios_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_policy ON scenarios;
CREATE POLICY scenarios_org_policy ON scenarios FOR SELECT USING (
  organization_id = current_organization_id()
  OR is_shared = true
  OR organization_id IS NULL  -- 管理シナリオ
  OR is_admin()
);
CREATE POLICY scenarios_org_modify_policy ON scenarios FOR INSERT USING (
  organization_id = current_organization_id()
  OR is_admin()
);
CREATE POLICY scenarios_org_update_policy ON scenarios FOR UPDATE USING (
  organization_id = current_organization_id()
  OR is_admin()
);
CREATE POLICY scenarios_org_delete_policy ON scenarios FOR DELETE USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- customers テーブル
DROP POLICY IF EXISTS customers_policy ON customers;
DROP POLICY IF EXISTS customers_org_policy ON customers;
CREATE POLICY customers_org_policy ON customers FOR ALL USING (
  organization_id = current_organization_id()
  OR user_id = auth.uid()  -- 自分自身の顧客データ
  OR is_admin()
);

-- schedule_events テーブル
DROP POLICY IF EXISTS schedule_events_policy ON schedule_events;
DROP POLICY IF EXISTS schedule_events_org_policy ON schedule_events;
CREATE POLICY schedule_events_org_policy ON schedule_events FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- reservations テーブル
DROP POLICY IF EXISTS reservations_policy ON reservations;
DROP POLICY IF EXISTS reservations_org_policy ON reservations;
CREATE POLICY reservations_org_policy ON reservations FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- performance_kits テーブル
DROP POLICY IF EXISTS performance_kits_policy ON performance_kits;
DROP POLICY IF EXISTS performance_kits_org_policy ON performance_kits;
CREATE POLICY performance_kits_org_policy ON performance_kits FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- shift_submissions テーブル
DROP POLICY IF EXISTS shift_submissions_policy ON shift_submissions;
DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
CREATE POLICY shift_submissions_org_policy ON shift_submissions FOR ALL USING (
  organization_id = current_organization_id()
  OR is_admin()
);

-- shift_notifications テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_notifications') THEN
    DROP POLICY IF EXISTS shift_notifications_policy ON shift_notifications;
    DROP POLICY IF EXISTS shift_notifications_org_policy ON shift_notifications;
    EXECUTE 'CREATE POLICY shift_notifications_org_policy ON shift_notifications FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- shift_button_states テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_button_states') THEN
    DROP POLICY IF EXISTS shift_button_states_policy ON shift_button_states;
    DROP POLICY IF EXISTS shift_button_states_org_policy ON shift_button_states;
    EXECUTE 'CREATE POLICY shift_button_states_org_policy ON shift_button_states FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- private_booking_requests テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_booking_requests') THEN
    DROP POLICY IF EXISTS private_booking_requests_policy ON private_booking_requests;
    DROP POLICY IF EXISTS private_booking_requests_org_policy ON private_booking_requests;
    EXECUTE 'CREATE POLICY private_booking_requests_org_policy ON private_booking_requests FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- miscellaneous_transactions テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'miscellaneous_transactions') THEN
    DROP POLICY IF EXISTS miscellaneous_transactions_policy ON miscellaneous_transactions;
    DROP POLICY IF EXISTS miscellaneous_transactions_org_policy ON miscellaneous_transactions;
    EXECUTE 'CREATE POLICY miscellaneous_transactions_org_policy ON miscellaneous_transactions FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- gm_availability_responses テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gm_availability_responses') THEN
    DROP POLICY IF EXISTS gm_availability_responses_policy ON gm_availability_responses;
    DROP POLICY IF EXISTS gm_availability_responses_org_policy ON gm_availability_responses;
    EXECUTE 'CREATE POLICY gm_availability_responses_org_policy ON gm_availability_responses FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- global_settings テーブル（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
    DROP POLICY IF EXISTS global_settings_policy ON global_settings;
    DROP POLICY IF EXISTS global_settings_org_policy ON global_settings;
    EXECUTE 'CREATE POLICY global_settings_org_policy ON global_settings FOR ALL USING (
      organization_id = current_organization_id()
      OR is_admin()
    )';
  END IF;
END $$;

-- ================================================
-- 5. 予約サイト用の公開ポリシー
-- ※ 予約サイトは認証なしでアクセスするため、別途ポリシーが必要
-- ================================================

-- scenarios: 公開シナリオは匿名ユーザーも閲覧可能
CREATE POLICY scenarios_public_read ON scenarios FOR SELECT USING (
  status = 'available'
);

-- schedule_events: 公開イベントは匿名ユーザーも閲覧可能
CREATE POLICY schedule_events_public_read ON schedule_events FOR SELECT USING (
  is_cancelled = false
);

-- stores: 店舗情報は匿名ユーザーも閲覧可能
CREATE POLICY stores_public_read ON stores FOR SELECT USING (
  status = 'active'
);

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT current_organization_id();
-- SELECT is_admin();
-- SELECT is_license_manager();

