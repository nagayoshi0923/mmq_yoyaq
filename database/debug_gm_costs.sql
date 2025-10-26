-- GM報酬データのデバッグ

-- 1. 特定のシナリオのgm_costsを確認
SELECT 
  title,
  gm_costs,
  jsonb_pretty(gm_costs) as gm_costs_formatted
FROM scenarios
WHERE title LIKE '%機巧人形%' OR title LIKE '%百鬼の夜%'
LIMIT 5;

-- 2. gm_costsが設定されているシナリオの数
SELECT 
  COUNT(*) as total_scenarios,
  COUNT(CASE WHEN gm_costs IS NOT NULL AND jsonb_array_length(gm_costs) > 0 THEN 1 END) as scenarios_with_gm_costs,
  COUNT(CASE WHEN gm_costs IS NULL OR jsonb_array_length(gm_costs) = 0 THEN 1 END) as scenarios_without_gm_costs
FROM scenarios;

-- 3. gm_costsの内容例
SELECT 
  title,
  gm_costs
FROM scenarios
WHERE gm_costs IS NOT NULL 
  AND jsonb_array_length(gm_costs) > 0
LIMIT 5;

-- 4. 最近の公演とそのシナリオのgm_costs
SELECT 
  se.date,
  se.scenario,
  se.category,
  s.title as scenario_title,
  s.gm_costs
FROM schedule_events se
LEFT JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= CURRENT_DATE - INTERVAL '7 days'
  AND se.is_cancelled = false
ORDER BY se.date DESC
LIMIT 10;

