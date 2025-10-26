-- GM時給設定の例
-- add_gm_hourly_wage_settings.sql を先に実行してください

-- ========================================
-- 個別シナリオの設定例
-- ========================================

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
WHERE duration >= 360;

-- 例4: 特定の作者のシナリオすべてに高時給を設定
UPDATE scenarios
SET gm_hourly_wage_settings = jsonb_build_object(
  'wage_type', 'hourly',
  'first_rate_per_30min', 950,
  'first_threshold_minutes', 300,
  'after_rate_per_30min', 550
)
WHERE author = '特定の作者名';

-- ========================================
-- 確認クエリ
-- ========================================

-- 設定を確認
SELECT 
  title,
  duration,
  gm_hourly_wage_settings->>'wage_type' as 計算方式,
  (gm_hourly_wage_settings->>'first_rate_per_30min')::int as 基本時給_30分単位,
  (gm_hourly_wage_settings->>'first_threshold_minutes')::int / 60.0 as 閾値_時間,
  (gm_hourly_wage_settings->>'after_rate_per_30min')::int as 超過時給_30分単位
FROM scenarios
ORDER BY title
LIMIT 10;

-- 計算結果を確認
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

-- 時給別にグループ化
SELECT 
  (gm_hourly_wage_settings->>'first_rate_per_30min')::int as 時給設定,
  COUNT(*) as シナリオ数,
  AVG(duration) as 平均所要時間
FROM scenarios
WHERE gm_hourly_wage_settings->>'wage_type' = 'hourly'
GROUP BY (gm_hourly_wage_settings->>'first_rate_per_30min')::int
ORDER BY 時給設定 DESC;

