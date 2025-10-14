-- シナリオテーブルにライセンス関連のカラムを追加
-- license_amount と gm_test_fee を追加

-- license_amount カラムの追加（ライセンス料）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'license_amount') THEN
        ALTER TABLE scenarios ADD COLUMN license_amount INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.license_amount IS 'ライセンス料（円）';
    END IF;
END $$;

-- gm_test_fee カラムの追加（GMテスト料金）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'scenarios' AND column_name = 'gm_test_fee') THEN
        ALTER TABLE scenarios ADD COLUMN gm_test_fee INTEGER DEFAULT 0;
        COMMENT ON COLUMN scenarios.gm_test_fee IS 'GMテスト料金（円）';
    END IF;
END $$;

-- 確認
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'scenarios' 
  AND column_name IN ('license_amount', 'gm_test_fee', 'gm_fee', 'participation_fee')
ORDER BY column_name;
