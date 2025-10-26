-- 売上計算に必要なGMデータの確認

-- 1. 最近の公演のGM配置状況
SELECT 
  se.date,
  se.scenario,
  se.category,
  se.gms,
  COALESCE(array_length(se.gms, 1), 0) as gm_count,
  s.gm_costs
FROM schedule_events se
LEFT JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= CURRENT_DATE - INTERVAL '7 days'
  AND se.is_cancelled = false
ORDER BY se.date DESC
LIMIT 20;

-- 2. GM配置がないイベント
SELECT 
  date,
  scenario,
  category,
  gms,
  scenario_id
FROM schedule_events
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND is_cancelled = false
  AND (gms IS NULL OR array_length(gms, 1) = 0 OR array_length(gms, 1) IS NULL)
ORDER BY date DESC
LIMIT 10;

-- 3. gm_costsが設定されているシナリオ
SELECT 
  title,
  gm_costs,
  jsonb_array_length(gm_costs) as gm_cost_count
FROM scenarios
WHERE gm_costs IS NOT NULL 
  AND jsonb_array_length(gm_costs) > 0
LIMIT 10;

-- 4. gm_costsが未設定のシナリオ
SELECT 
  title,
  author,
  gm_costs
FROM scenarios
WHERE gm_costs IS NULL 
   OR jsonb_array_length(gm_costs) = 0
LIMIT 10;

