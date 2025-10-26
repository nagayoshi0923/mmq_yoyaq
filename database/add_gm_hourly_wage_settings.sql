-- シナリオごとにGM時給設定を追加

-- 1. scenariosテーブルに時給設定カラムを追加
ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS gm_hourly_wage_settings JSONB DEFAULT jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 875,
  'first_threshold_minutes', 300,
  'after_rate_per_30min', 500
);

-- カラムの説明:
-- gm_hourly_wage_settings: GM時給設定（JSONB形式）
--   {
--     "wage_type": "hourly" | "fixed",  // 計算方式（時給制 or 固定報酬）
--     "first_rate_per_30min": 875,      // 最初の時間帯の30分あたり料金
--     "first_threshold_minutes": 300,    // 最初の時間帯の閾値（分単位、デフォルト5時間=300分）
--     "after_rate_per_30min": 500       // 閾値超過後の30分あたり料金
--   }

COMMENT ON COLUMN scenarios.gm_hourly_wage_settings IS 'GM時給設定（時給制の場合の計算パラメータ）';

-- 2. 既存のシナリオにデフォルト設定を適用
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 875,
  'first_threshold_minutes', 300,
  'after_rate_per_30min', 500
)
WHERE gm_hourly_wage_settings IS NULL;

-- 3. 設定例：特定のシナリオの時給を変更
-- 例1: 「機巧人形の心臓」の時給を高く設定（30分あたり1000円、5時間超は600円）
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 1000,
  'first_threshold_minutes', 300,
  'after_rate_per_30min', 600
)
WHERE title = '機巧人形の心臓';

-- 例2: 「百鬼の夜、月光の影」を固定報酬に設定（時給制を使わない）
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'fixed'
)
WHERE title = '百鬼の夜、月光の影';

-- 例3: 長時間シナリオの閾値を6時間に変更
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 875,
  'first_threshold_minutes', 360,
  'after_rate_per_30min', 500
)
WHERE title LIKE '%長時間%';

-- 4. 確認クエリ：設定を確認
SELECT 
  title,
  duration,
  gm_hourly_wage_settings,
  gm_hourly_wage_settings->>'wage_type' as 計算方式,
  (gm_hourly_wage_settings->>'first_rate_per_30min')::int as 基本時給_30分単位,
  (gm_hourly_wage_settings->>'first_threshold_minutes')::int / 60.0 as 閾値_時間,
  (gm_hourly_wage_settings->>'after_rate_per_30min')::int as 超過時給_30分単位
FROM scenarios
ORDER BY title
LIMIT 10;

-- 5. 時給計算のシミュレーション関数
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

-- 6. 計算例を確認
SELECT 
  title,
  duration,
  gm_hourly_wage_settings->>'wage_type' as 計算方式,
  calculate_gm_wage(duration, gm_hourly_wage_settings) as GM給与_1人あたり,
  jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as GM人数,
  calculate_gm_wage(duration, gm_hourly_wage_settings) * jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as GM給与_合計
FROM scenarios
WHERE gm_hourly_wage_settings->>'wage_type' = 'hourly'
ORDER BY duration DESC
LIMIT 10;

