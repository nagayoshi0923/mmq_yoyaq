-- scenario_idが紐付けられていないイベントを確認
SELECT 
  scenario,
  COUNT(*) as count,
  MIN(date) as first_date,
  MAX(date) as last_date
FROM schedule_events
WHERE scenario_id IS NULL
  AND scenario IS NOT NULL
  AND scenario != ''
GROUP BY scenario
ORDER BY count DESC
LIMIT 50;

-- 同じシナリオ名でIDがあるものとないものが混在しているか確認
SELECT 
  scenario,
  COUNT(*) FILTER (WHERE scenario_id IS NOT NULL) as with_id,
  COUNT(*) FILTER (WHERE scenario_id IS NULL) as without_id
FROM schedule_events
WHERE scenario IS NOT NULL
  AND scenario != ''
GROUP BY scenario
HAVING COUNT(*) FILTER (WHERE scenario_id IS NULL) > 0
ORDER BY COUNT(*) FILTER (WHERE scenario_id IS NULL) DESC
LIMIT 30;

