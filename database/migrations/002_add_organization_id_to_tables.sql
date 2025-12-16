-- マルチテナント対応: 既存テーブルに organization_id を追加
-- 実行日: 2024-12-17
-- 
-- 【重要】このマイグレーションは以下の順序で実行すること:
-- 1. 001_create_organizations_table.sql
-- 2. このファイル (002_add_organization_id_to_tables.sql)

-- クインズワルツの organization_id
DO $$
DECLARE
  queens_waltz_org_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN

-- ================================================
-- 主要テーブルに organization_id を追加
-- ================================================

-- stores テーブル
ALTER TABLE stores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE stores SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE stores ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON stores(organization_id);

-- staff テーブル
ALTER TABLE staff ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE staff SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE staff ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_organization_id ON staff(organization_id);

-- scenarios テーブル
-- ※ managed シナリオは organization_id = NULL で共有シナリオとして扱う
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;
-- 管理シナリオは共有、それ以外はクインズワルツ所有
UPDATE scenarios SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL AND scenario_type != 'managed';
UPDATE scenarios SET is_shared = true WHERE scenario_type = 'managed';
CREATE INDEX IF NOT EXISTS idx_scenarios_organization_id ON scenarios(organization_id);

-- customers テーブル
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE customers SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE customers ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON customers(organization_id);

-- schedule_events テーブル
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE schedule_events SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE schedule_events ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_events_organization_id ON schedule_events(organization_id);

-- reservations テーブル
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE reservations SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE reservations ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_organization_id ON reservations(organization_id);

-- performance_kits テーブル
ALTER TABLE performance_kits ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE performance_kits SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE performance_kits ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_performance_kits_organization_id ON performance_kits(organization_id);

-- ================================================
-- 追加テーブルに organization_id を追加
-- ================================================

-- shift_submissions テーブル
ALTER TABLE shift_submissions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
UPDATE shift_submissions SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
ALTER TABLE shift_submissions ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shift_submissions_organization_id ON shift_submissions(organization_id);

-- shift_notifications テーブル（存在する場合）
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_notifications') THEN
    ALTER TABLE shift_notifications ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE shift_notifications SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE shift_notifications ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_shift_notifications_organization_id ON shift_notifications(organization_id);
  END IF;
END $inner$;

-- shift_button_states テーブル（存在する場合）
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shift_button_states') THEN
    ALTER TABLE shift_button_states ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE shift_button_states SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE shift_button_states ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_shift_button_states_organization_id ON shift_button_states(organization_id);
  END IF;
END $inner$;

-- private_booking_requests テーブル
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'private_booking_requests') THEN
    ALTER TABLE private_booking_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE private_booking_requests SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE private_booking_requests ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_private_booking_requests_organization_id ON private_booking_requests(organization_id);
  END IF;
END $inner$;

-- miscellaneous_transactions テーブル
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'miscellaneous_transactions') THEN
    ALTER TABLE miscellaneous_transactions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE miscellaneous_transactions SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE miscellaneous_transactions ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_miscellaneous_transactions_organization_id ON miscellaneous_transactions(organization_id);
  END IF;
END $inner$;

-- gm_availability_responses テーブル
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gm_availability_responses') THEN
    ALTER TABLE gm_availability_responses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE gm_availability_responses SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE gm_availability_responses ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_gm_availability_responses_organization_id ON gm_availability_responses(organization_id);
  END IF;
END $inner$;

-- authors テーブル（シナリオ著者は共有リソースなので organization_id は任意）
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'authors') THEN
    ALTER TABLE authors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    -- authors は共有リソースとして NULL のままでもOK
    CREATE INDEX IF NOT EXISTS idx_authors_organization_id ON authors(organization_id);
  END IF;
END $inner$;

-- global_settings テーブル
DO $inner$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'global_settings') THEN
    ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    UPDATE global_settings SET organization_id = queens_waltz_org_id WHERE organization_id IS NULL;
    ALTER TABLE global_settings ALTER COLUMN organization_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_global_settings_organization_id ON global_settings(organization_id);
  END IF;
END $inner$;

END $$;

-- ================================================
-- 確認用クエリ
-- ================================================
-- SELECT table_name, column_name 
-- FROM information_schema.columns 
-- WHERE column_name = 'organization_id'
-- ORDER BY table_name;

