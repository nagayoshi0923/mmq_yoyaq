-- global_settingsテーブルを組織ごとの設定に変更し、給与設定カラムを追加
-- 
-- 変更内容:
-- 1. organization_idカラムを追加（組織ごとの設定を可能に）
-- 2. 給与設定カラムを追加（GM基本給、時給、受付固定給）
-- 3. RLSポリシーを更新（自分の組織の設定のみアクセス可能）

-- ============================================
-- 1. organization_idカラムを追加
-- ============================================
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- 既存レコードにクインズワルツのorganization_idを設定
UPDATE global_settings 
SET organization_id = 'a0000000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- organization_idをNOT NULLに変更
ALTER TABLE global_settings 
ALTER COLUMN organization_id SET NOT NULL;

-- ユニーク制約を追加（1組織1設定）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'global_settings_organization_id_unique'
  ) THEN
    ALTER TABLE global_settings
    ADD CONSTRAINT global_settings_organization_id_unique UNIQUE (organization_id);
  END IF;
END $$;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_global_settings_organization_id 
ON global_settings(organization_id);

-- ============================================
-- 2. 給与設定カラムを追加
-- ============================================

-- 通常公演用の設定
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS gm_base_pay INTEGER DEFAULT 2000;

ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS gm_hourly_rate INTEGER DEFAULT 1300;

-- GMテスト用の設定（基本給なし）
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS gm_test_base_pay INTEGER DEFAULT 0;

ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS gm_test_hourly_rate INTEGER DEFAULT 1300;

-- 受付の固定給与
ALTER TABLE global_settings 
ADD COLUMN IF NOT EXISTS reception_fixed_pay INTEGER DEFAULT 2000;

-- 既存レコードにデフォルト値を設定
UPDATE global_settings 
SET 
  gm_base_pay = COALESCE(gm_base_pay, 2000),
  gm_hourly_rate = COALESCE(gm_hourly_rate, 1300),
  gm_test_base_pay = COALESCE(gm_test_base_pay, 0),
  gm_test_hourly_rate = COALESCE(gm_test_hourly_rate, 1300),
  reception_fixed_pay = COALESCE(reception_fixed_pay, 2000);

-- ============================================
-- 3. RLSポリシーを更新（組織ごとにフィルタリング）
-- ============================================
DROP POLICY IF EXISTS "Anyone can read global settings" ON global_settings;
DROP POLICY IF EXISTS "Authenticated users can update global settings" ON global_settings;
DROP POLICY IF EXISTS "Users can read own organization settings" ON global_settings;
DROP POLICY IF EXISTS "Users can update own organization settings" ON global_settings;
DROP POLICY IF EXISTS "Users can insert own organization settings" ON global_settings;

-- 自分の組織の設定のみ読み取り可能
CREATE POLICY "Users can read own organization settings"
  ON global_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 自分の組織の設定のみ更新可能
CREATE POLICY "Users can update own organization settings"
  ON global_settings FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );

-- 自分の組織の設定を挿入可能
CREATE POLICY "Users can insert own organization settings"
  ON global_settings FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM staff WHERE user_id = auth.uid()
    )
  );





