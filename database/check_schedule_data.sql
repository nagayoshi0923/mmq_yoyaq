-- スケジュールイベントの実際のデータを確認

-- 2025年9月の全イベント数
SELECT 
  COUNT(*) as total_events,
  COUNT(CASE WHEN category = 'open' THEN 1 END) as open_events,
  COUNT(CASE WHEN category = 'gmtest' THEN 1 END) as gmtest_events,
  COUNT(CASE WHEN category = 'private' THEN 1 END) as private_events
FROM schedule_events 
WHERE date >= '2025-09-01' AND date <= '2025-09-30';

-- 作者別のイベント数
SELECT 
  s.author,
  COUNT(se.id) as total_events,
  COUNT(CASE WHEN se.category = 'open' THEN 1 END) as open_events,
  COUNT(CASE WHEN se.category = 'gmtest' THEN 1 END) as gmtest_events
FROM schedule_events se
JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= '2025-09-01' AND se.date <= '2025-09-30'
GROUP BY s.author
ORDER BY s.author;

-- シナリオ別のイベント数（詳細）
SELECT 
  s.title,
  s.author,
  se.category,
  COUNT(se.id) as event_count
FROM schedule_events se
JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= '2025-09-01' AND se.date <= '2025-09-30'
GROUP BY s.title, s.author, se.category
ORDER BY s.author, s.title, se.category;
