-- schedule_eventsとscenariosのcapacity/player_count_maxを確認

SELECT 
  se.id,
  se.scenario,
  se.capacity as schedule_events_capacity,
  se.scenario_id,
  s.id as scenario_table_id,
  s.title as scenario_table_title,
  s.player_count_max as scenarios_player_count_max,
  CASE 
    WHEN se.capacity = s.player_count_max THEN '✅ 一致'
    WHEN se.capacity IS NULL THEN '⚠️ capacityがNULL'
    WHEN s.player_count_max IS NULL THEN '⚠️ player_count_maxがNULL'
    WHEN se.scenario_id IS NULL THEN '⚠️ scenario_idがNULL'
    ELSE '❌ 不一致'
  END as status
FROM schedule_events se
LEFT JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'  -- 直近30日間の公演
ORDER BY se.date DESC, se.start_time DESC
LIMIT 20;

