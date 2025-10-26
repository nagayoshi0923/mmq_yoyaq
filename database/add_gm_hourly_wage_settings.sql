-- シナリオごとにGM時給設定を追加

-- ========================================
-- STEP 1: カラムを追加
-- ========================================
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS gm_hourly_wage_settings JSONB;

COMMENT ON COLUMN scenarios.gm_hourly_wage_settings IS 'GM時給設定（時給制の場合の計算パラメータ）';

-- ========================================
-- STEP 2: デフォルト設定を適用
-- ========================================
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 875,
  'first_threshold_minutes', 300,
  'after_rate_per_30min', 500
)
WHERE gm_hourly_wage_settings IS NULL;

-- ========================================
-- STEP 3: 時給計算関数を作成
-- ========================================
CREATE OR REPLACE FUNCTION calculate_gm_wage(
  duration_minutes INT,
  wage_settings JSONB
) RETURNS INT AS $$
DECLARE
  wage_type TEXT;
  rounded_minutes INT;
  half_hour_units INT;
  first_rate INT;
  threshold_minutes INT;
  threshold_units INT;
  after_rate INT;
  first_part INT;
  additional_units INT;
  additional_part INT;
BEGIN
  wage_type := wage_settings->>'wage_type';
  
  -- 固定報酬の場合はgm_costsを使用（この関数では計算しない）
  IF wage_type = 'fixed' THEN
    RETURN NULL;
  END IF;
  
  -- 時給制の計算
  first_rate := (wage_settings->>'first_rate_per_30min')::INT;
  threshold_minutes := (wage_settings->>'first_threshold_minutes')::INT;
  after_rate := (wage_settings->>'after_rate_per_30min')::INT;
  
  -- 30分単位に切り上げ
  rounded_minutes := CEIL(duration_minutes / 30.0) * 30;
  half_hour_units := rounded_minutes / 30;
  threshold_units := threshold_minutes / 30;
  
  IF half_hour_units <= threshold_units THEN
    -- 閾値以内
    RETURN first_rate * half_hour_units;
  ELSE
    -- 閾値超過
    first_part := first_rate * threshold_units;
    additional_units := half_hour_units - threshold_units;
    additional_part := after_rate * additional_units;
    RETURN first_part + additional_part;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ========================================
-- 完了！以下は任意で実行
-- ========================================

-- 設定を確認
-- SELECT 
--   title,
--   duration,
--   gm_hourly_wage_settings,
--   gm_hourly_wage_settings->>'wage_type' as 計算方式,
--   (gm_hourly_wage_settings->>'first_rate_per_30min')::int as 基本時給_30分単位,
--   (gm_hourly_wage_settings->>'first_threshold_minutes')::int / 60.0 as 閾値_時間,
--   (gm_hourly_wage_settings->>'after_rate_per_30min')::int as 超過時給_30分単位
-- FROM scenarios
-- ORDER BY title
-- LIMIT 10;

-- 計算例を確認
-- SELECT 
--   title,
--   duration,
--   gm_hourly_wage_settings->>'wage_type' as 計算方式,
--   calculate_gm_wage(duration, gm_hourly_wage_settings) as GM給与_1人あたり,
--   jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as GM人数,
--   calculate_gm_wage(duration, gm_hourly_wage_settings) * jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as GM給与_合計
-- FROM scenarios
-- WHERE gm_hourly_wage_settings->>'wage_type' = 'hourly'
-- ORDER BY duration DESC
-- LIMIT 10;
