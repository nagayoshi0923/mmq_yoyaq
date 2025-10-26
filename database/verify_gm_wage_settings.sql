-- GM時給設定が正しく追加されたか確認

-- 1. カラムが追加されているか確認
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'scenarios'
  AND column_name = 'gm_hourly_wage_settings';

-- 2. 実際のデータを確認（最初の10件）
SELECT 
  title,
  duration,
  gm_hourly_wage_settings
FROM scenarios
LIMIT 10;

-- 3. 設定内容を見やすく表示
SELECT 
  title,
  duration,
  gm_hourly_wage_settings->>'wage_type' as 計算方式,
  (gm_hourly_wage_settings->>'first_rate_per_30min')::text as "30分単価(最初)",
  (gm_hourly_wage_settings->>'first_threshold_minutes')::int / 60 as "閾値(時間)",
  (gm_hourly_wage_settings->>'after_rate_per_30min')::text as "30分単価(超過後)"
FROM scenarios
WHERE gm_hourly_wage_settings IS NOT NULL
LIMIT 10;

-- 4. 計算関数をテスト
-- 3時間（180分）のシナリオの給与計算
SELECT 
  '3時間のシナリオ' as テストケース,
  calculate_gm_wage(180, jsonb_build_object(
    'wage_type', 'hourly',
    'first_rate_per_30min', 875,
    'first_threshold_minutes', 300,
    'after_rate_per_30min', 500
  )) as "給与(円)";

-- 6時間（360分）のシナリオの給与計算
SELECT 
  '6時間のシナリオ' as テストケース,
  calculate_gm_wage(360, jsonb_build_object(
    'wage_type', 'hourly',
    'first_rate_per_30min', 875,
    'first_threshold_minutes', 300,
    'after_rate_per_30min', 500
  )) as "給与(円)";

-- 5. 実際のシナリオで計算例
SELECT 
  title,
  duration as "所要時間(分)",
  duration / 60.0 as "所要時間(時間)",
  calculate_gm_wage(duration, gm_hourly_wage_settings) as "GM給与(1人)",
  jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as "GM人数",
  calculate_gm_wage(duration, gm_hourly_wage_settings) * 
    jsonb_array_length(COALESCE(gm_costs, '[]'::jsonb)) as "GM給与合計"
FROM scenarios
WHERE gm_hourly_wage_settings->>'wage_type' = 'hourly'
  AND duration IS NOT NULL
ORDER BY duration
LIMIT 10;

