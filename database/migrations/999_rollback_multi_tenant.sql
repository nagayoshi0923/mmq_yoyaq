-- ============================================
-- マルチテナント対応ロールバック
-- ============================================
-- 
-- 【注意】このスクリプトは問題が発生した場合のみ実行してください。
-- 実行すると、マルチテナント対応の全ての変更が取り消されます。
--
-- 実行順序: このファイル1つで全てロールバックできます
-- ============================================

-- ============================================
-- 1. RLSポリシーを元に戻す
-- ============================================

-- stores テーブル
DROP POLICY IF EXISTS stores_org_policy ON stores;
DROP POLICY IF EXISTS stores_public_read ON stores;
CREATE POLICY stores_policy ON stores FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

-- staff テーブル
DROP POLICY IF EXISTS staff_org_policy ON staff;
CREATE POLICY staff_policy ON staff FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

-- scenarios テーブル
DROP POLICY IF EXISTS scenarios_org_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_modify_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_update_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_org_delete_policy ON scenarios;
DROP POLICY IF EXISTS scenarios_public_read ON scenarios;
CREATE POLICY scenarios_policy ON scenarios FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

-- customers テーブル
DROP POLICY IF EXISTS customers_org_policy ON customers;
CREATE POLICY customers_policy ON customers FOR ALL USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'staff')
  )
);

-- schedule_events テーブル
DROP POLICY IF EXISTS schedule_events_org_policy ON schedule_events;
DROP POLICY IF EXISTS schedule_events_public_read ON schedule_events;
-- 元のポリシーがあれば復元（なければ作成）

-- reservations テーブル
DROP POLICY IF EXISTS reservations_org_policy ON reservations;
-- 元のポリシーがあれば復元

-- performance_kits テーブル
DROP POLICY IF EXISTS performance_kits_org_policy ON performance_kits;
-- 元のポリシーがあれば復元

-- shift_submissions テーブル
DROP POLICY IF EXISTS shift_submissions_org_policy ON shift_submissions;
-- 元のポリシーがあれば復元

-- organizations テーブル
DROP POLICY IF EXISTS organizations_select_policy ON organizations;
DROP POLICY IF EXISTS organizations_admin_policy ON organizations;

-- ============================================
-- 2. ヘルパー関数を削除
-- ============================================

DROP FUNCTION IF EXISTS current_organization_id();
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS is_license_manager();

-- ============================================
-- 3. ビューを削除
-- ============================================

DROP VIEW IF EXISTS license_performance_summary;

-- ============================================
-- 4. 新規テーブルを削除
-- ============================================

DROP TABLE IF EXISTS external_performance_reports;
DROP TABLE IF EXISTS organizations CASCADE;

-- ============================================
-- 5. 既存テーブルから organization_id カラムを削除
-- ============================================

-- stores
ALTER TABLE stores DROP COLUMN IF EXISTS organization_id;

-- staff
ALTER TABLE staff DROP COLUMN IF EXISTS organization_id;

-- scenarios
ALTER TABLE scenarios DROP COLUMN IF EXISTS organization_id;
ALTER TABLE scenarios DROP COLUMN IF EXISTS is_shared;

-- customers
ALTER TABLE customers DROP COLUMN IF EXISTS organization_id;

-- schedule_events
ALTER TABLE schedule_events DROP COLUMN IF EXISTS organization_id;

-- reservations
ALTER TABLE reservations DROP COLUMN IF EXISTS organization_id;

-- performance_kits
ALTER TABLE performance_kits DROP COLUMN IF EXISTS organization_id;

-- shift_submissions
ALTER TABLE shift_submissions DROP COLUMN IF EXISTS organization_id;

-- shift_notifications（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_notifications') THEN
    ALTER TABLE shift_notifications DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- shift_button_states（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_button_states') THEN
    ALTER TABLE shift_button_states DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- private_booking_requests（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_booking_requests') THEN
    ALTER TABLE private_booking_requests DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- miscellaneous_transactions（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'miscellaneous_transactions') THEN
    ALTER TABLE miscellaneous_transactions DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- gm_availability_responses（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gm_availability_responses') THEN
    ALTER TABLE gm_availability_responses DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- authors（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'authors') THEN
    ALTER TABLE authors DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- global_settings（存在する場合）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
    ALTER TABLE global_settings DROP COLUMN IF EXISTS organization_id;
  END IF;
END $$;

-- ============================================
-- 6. インデックスを削除（カラム削除で自動削除されるはずだが念のため）
-- ============================================

DROP INDEX IF EXISTS idx_stores_organization_id;
DROP INDEX IF EXISTS idx_staff_organization_id;
DROP INDEX IF EXISTS idx_scenarios_organization_id;
DROP INDEX IF EXISTS idx_customers_organization_id;
DROP INDEX IF EXISTS idx_schedule_events_organization_id;
DROP INDEX IF EXISTS idx_reservations_organization_id;
DROP INDEX IF EXISTS idx_performance_kits_organization_id;
DROP INDEX IF EXISTS idx_shift_submissions_organization_id;
DROP INDEX IF EXISTS idx_organizations_slug;
DROP INDEX IF EXISTS idx_organizations_is_active;

-- ============================================
-- 完了確認
-- ============================================
-- SELECT 'Rollback completed successfully' AS status;

