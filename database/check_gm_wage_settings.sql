-- GM時給設定が追加されたか確認

-- 1. カラムが追加されたか確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scenarios' 
  AND column_name = 'gm_hourly_wage_settings';

-- 2. 実際のデータを確認（最初の5件）
SELECT 
  title,
  duration,
  gm_costs,
  gm_hourly_wage_settings
FROM scenarios
LIMIT 5;

-- 3. 設定内容を見やすく表示
SELECT 
  title,
  duration,
  gm_hourly_wage_settings->>'wage_type' as 計算方式,
  (gm_hourly_wage_settings->>'first_rate_per_30min')::int as "30分単価（最初）",
  (gm_hourly_wage_settings->>'first_threshold_minutes')::int as "閾値（分）",
  (gm_hourly_wage_settings->>'after_rate_per_30min')::int as "30分単価（超過）"
FROM scenarios
WHERE gm_hourly_wage_settings IS NOT NULL
LIMIT 10;

