-- シナリオテーブルにライセンス関連のカラムを追加（命名規則を整理）
-- 
-- 命名規則:
-- - fee: お客様から受け取る金額
-- - amount: 作者やGMに支払う金額

-- 1. license_amount カラムの追加（通常公演：作者に支払うライセンス料）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'license_amount') THEN
        ALTER TABLE scenarios ADD COLUMN license_amount INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.license_amount IS '通常公演：作者に支払うライセンス料（円）';
    END IF;
END $$;

-- 2. gm_test_license_amount カラムの追加（GMテスト公演：作者に支払うライセンス料）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'gm_test_license_amount') THEN
        ALTER TABLE scenarios ADD COLUMN gm_test_license_amount INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.gm_test_license_amount IS 'GMテスト公演：作者に支払うライセンス料（円）';
    END IF;
END $$;

-- 3. gm_test_participation_fee カラムの追加（GMテスト公演：お客様から受け取る参加費）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'gm_test_participation_fee') THEN
        ALTER TABLE scenarios ADD COLUMN gm_test_participation_fee INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.gm_test_participation_fee IS 'GMテスト公演：お客様から受け取る参加費（円）';
    END IF;
END $$;

-- 4. gm_reward_amount カラムの追加（GM報酬：GMスタッフに支払う金額）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'gm_reward_amount') THEN
        ALTER TABLE scenarios ADD COLUMN gm_reward_amount INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.gm_reward_amount IS 'GM報酬：GMスタッフに支払う金額（円）';
    END IF;
END $$;

-- 既存の gm_fee カラムがあれば、gm_reward_amount に統合することを推奨
-- （手動で以下を実行）
-- UPDATE scenarios SET gm_reward_amount = gm_fee WHERE gm_fee IS NOT NULL AND gm_fee > 0;
-- ALTER TABLE scenarios DROP COLUMN gm_fee;

-- 確認
SELECT 
    column_name, 
    data_type, 
    column_default,
    col_description('scenarios'::regclass, ordinal_position) as description
FROM information_schema.columns 
WHERE table_name = 'scenarios' 
  AND column_name IN (
    'participation_fee',
    'gm_test_participation_fee',
    'license_amount',
    'gm_test_license_amount',
    'gm_reward_amount',
    'gm_fee'
  )
ORDER BY column_name;

