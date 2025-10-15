-- scenario_idが設定されていない公演を確認
SELECT 
  id,
  date,
  scenario as scenario_text,
  scenario_id,
  CASE 
    WHEN scenario_id IS NULL THEN 'IDなし'
    ELSE 'IDあり'
  END as status
FROM schedule_events
WHERE date >= '2025-01-01'
ORDER BY date DESC
LIMIT 50;

-- 統計情報
SELECT 
  COUNT(*) as total_events,
  COUNT(scenario_id) as with_id,
  COUNT(*) - COUNT(scenario_id) as without_id,
  ROUND(COUNT(scenario_id) * 100.0 / COUNT(*), 2) as percentage_with_id
FROM schedule_events
WHERE date >= '2025-01-01';

