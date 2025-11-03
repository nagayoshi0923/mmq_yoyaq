-- schedule_eventsテーブルのcapacityを、scenariosテーブルのplayer_count_maxで更新
-- capacityがNULLまたは8の場合のみ更新

UPDATE schedule_events se
SET capacity = s.player_count_max,
    updated_at = NOW()
FROM scenarios s
WHERE se.scenario_id = s.id
  AND (se.capacity IS NULL OR se.capacity = 8)
  AND s.player_count_max IS NOT NULL;

-- 更新結果を確認
SELECT 
  se.id,
  se.scenario,
  se.capacity,
  s.player_count_max,
  CASE 
    WHEN se.capacity = s.player_count_max THEN 'OK'
    ELSE '要確認'
  END as status
FROM schedule_events se
LEFT JOIN scenarios s ON se.scenario_id = s.id
WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'  -- 直近30日間の公演
ORDER BY se.date DESC, se.start_time DESC
LIMIT 50;

