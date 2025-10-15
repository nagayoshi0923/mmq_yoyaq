-- schedule_eventsのscenarioフィールド（テキスト）からscenario_idを設定する
-- シナリオ名が一致するものを自動的に紐付ける

UPDATE schedule_events se
SET scenario_id = s.id
FROM scenarios s
WHERE se.scenario_id IS NULL
  AND se.scenario = s.title
  AND se.scenario IS NOT NULL
  AND se.scenario != '';

-- 更新結果を確認
SELECT 
  COUNT(*) as updated_count
FROM schedule_events
WHERE scenario_id IS NOT NULL
  AND date >= '2025-01-01';

-- まだIDが設定されていない公演を確認（シナリオ名が一致しないもの）
SELECT DISTINCT
  se.scenario as scenario_text,
  COUNT(*) as event_count
FROM schedule_events se
WHERE se.scenario_id IS NULL
  AND se.scenario IS NOT NULL
  AND se.scenario != ''
  AND se.date >= '2025-01-01'
GROUP BY se.scenario
ORDER BY event_count DESC;

