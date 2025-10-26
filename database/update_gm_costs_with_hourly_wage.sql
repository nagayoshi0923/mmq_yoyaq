-- 時給計算した結果をgm_costsのrewardに一括更新

-- 時給計算関数（30分単位）
CREATE OR REPLACE FUNCTION calculate_hourly_wage(duration_minutes INT) 
RETURNS INT AS $$
DECLARE
  rounded_minutes INT;
  half_hour_units INT;
  first_rate INT := 875;   -- 30分あたり875円
  after_rate INT := 500;    -- 5時間超: 30分あたり500円
  threshold_units INT := 10; -- 5時間 = 10単位
BEGIN
  -- 30分単位に切り上げ
  rounded_minutes := CEIL(duration_minutes / 30.0) * 30;
  half_hour_units := rounded_minutes / 30;
  
  IF half_hour_units <= threshold_units THEN
    -- 5時間以内
    RETURN first_rate * half_hour_units;
  ELSE
    -- 5時間超
    RETURN (first_rate * threshold_units) + (after_rate * (half_hour_units - threshold_units));
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 全シナリオのgm_costsを時給計算で更新
UPDATE scenarios
SET gm_costs = (
  SELECT jsonb_agg(
    jsonb_set(
      gm_cost,
      '{reward}',
      to_jsonb(calculate_hourly_wage(duration))
    )
  )
  FROM jsonb_array_elements(gm_costs) AS gm_cost
)
WHERE gm_costs IS NOT NULL 
  AND jsonb_array_length(gm_costs) > 0;

-- 確認: 更新された給与を表示
SELECT 
  title,
  duration,
  ROUND(duration / 60.0, 1) as 時間,
  calculate_hourly_wage(duration) as 計算結果,
  gm_costs
FROM scenarios
WHERE gm_costs IS NOT NULL
ORDER BY duration
LIMIT 20;

-- 給与の分布を確認
SELECT 
  calculate_hourly_wage(duration) as GM給与,
  ROUND(duration / 60.0, 1) as 時間,
  COUNT(*) as シナリオ数
FROM scenarios
WHERE gm_costs IS NOT NULL
GROUP BY duration
ORDER BY duration;

