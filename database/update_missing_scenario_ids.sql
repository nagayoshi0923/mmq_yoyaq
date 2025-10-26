-- scenario_idがNULLだがscenarioタイトルがscenariosテーブルに存在する場合、IDを自動設定
-- ScenarioMatcherでタイトルだけ更新されたイベントにIDを紐付ける

UPDATE schedule_events se
SET scenario_id = s.id
FROM scenarios s
WHERE se.scenario_id IS NULL
  AND se.scenario = s.title
  AND se.scenario IS NOT NULL
  AND se.scenario != '';

-- 実行結果を確認
SELECT 
  COUNT(*) as total_events,
  COUNT(scenario_id) as with_id,
  COUNT(*) FILTER (WHERE scenario_id IS NULL AND scenario IS NOT NULL AND scenario != '') as without_id
FROM schedule_events;

