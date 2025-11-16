-- フランチャイズ機能のサポートを追加

-- 1. storesテーブルにフランチャイズ手数料カラムを追加
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS franchise_fee INTEGER DEFAULT 1000;

COMMENT ON COLUMN stores.franchise_fee IS 'フランチャイズ登録手数料（円）。デフォルト1000円';

-- 既存のフランチャイズ店舗にデフォルト値を設定
UPDATE stores
SET franchise_fee = 1000
WHERE franchise_fee IS NULL AND ownership_type = 'franchise';

-- 2. scenariosテーブルにシナリオタイプカラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS scenario_type TEXT DEFAULT 'normal' CHECK (scenario_type IN ('normal', 'managed'));

COMMENT ON COLUMN scenarios.scenario_type IS 'シナリオタイプ: normal（通常シナリオ）, managed（管理シナリオ）';

-- 既存のシナリオにデフォルト値を設定
UPDATE scenarios
SET scenario_type = 'normal'
WHERE scenario_type IS NULL;

-- 3. scenariosテーブルに他店用（フランチャイズ）ライセンス金額カラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS franchise_license_amount INTEGER DEFAULT 0;

COMMENT ON COLUMN scenarios.franchise_license_amount IS '他店用（フランチャイズ）通常公演：作者に支払うライセンス料（円）';

-- 4. scenariosテーブルに他店用（フランチャイズ）GMテストライセンス金額カラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS franchise_gm_test_license_amount INTEGER DEFAULT 0;

COMMENT ON COLUMN scenarios.franchise_gm_test_license_amount IS '他店用（フランチャイズ）GMテスト公演：作者に支払うライセンス料（円）';

-- 確認クエリ
SELECT 
    column_name, 
    data_type, 
    column_default,
    col_description('stores'::regclass, ordinal_position) as description
FROM information_schema.columns 
WHERE table_name = 'stores' 
  AND column_name = 'franchise_fee'
ORDER BY column_name;

SELECT 
    column_name, 
    data_type, 
    column_default,
    col_description('scenarios'::regclass, ordinal_position) as description
FROM information_schema.columns 
WHERE table_name = 'scenarios' 
  AND column_name IN ('scenario_type', 'franchise_license_amount', 'franchise_gm_test_license_amount')
ORDER BY column_name;

-- 店舗の所有形態とフランチャイズ手数料の確認
SELECT 
    name,
    CASE 
        WHEN ownership_type = 'corporate' THEN '直営店'
        WHEN ownership_type = 'franchise' THEN 'フランチャイズ'
        WHEN ownership_type = 'office' THEN 'オフィス'
        ELSE '未設定'
    END as 店舗タイプ,
    franchise_fee as フランチャイズ手数料,
    status
FROM stores
ORDER BY 
    CASE ownership_type
        WHEN 'corporate' THEN 1
        WHEN 'office' THEN 2
        WHEN 'franchise' THEN 3
        ELSE 4
    END,
    name;

