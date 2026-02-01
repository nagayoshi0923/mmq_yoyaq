-- =============================================================================
-- FIX TS-0: current_participants > 0 だが予約が0件のイベントを検出
-- =============================================================================
-- このクエリで問題のあるイベントを特定します。
-- 結果があれば、FIX TS-1 で予約を自動生成します。
-- =============================================================================

-- (1) 問題のあるイベント一覧
SELECT 
  'gap_events' AS section,
  se.id AS event_id,
  se.organization_id,
  se.date,
  se.start_time,
  se.scenario,
  se.scenario_id,
  se.store_id,
  COALESCE(se.current_participants, 0) AS current_participants,
  COALESCE(se.max_participants, se.capacity, 8) AS max_participants,
  COUNT(r.id) AS reservation_count
FROM public.schedule_events se
LEFT JOIN public.reservations r ON r.schedule_event_id = se.id
WHERE COALESCE(se.current_participants, 0) > 0
GROUP BY se.id, se.organization_id, se.date, se.start_time, se.scenario, 
         se.scenario_id, se.store_id, se.current_participants, se.max_participants, se.capacity
HAVING COUNT(r.id) = 0
ORDER BY se.date DESC, se.start_time DESC;

-- (2) カウント
SELECT 
  'summary' AS section,
  COUNT(*) AS events_needing_fix
FROM (
  SELECT se.id
  FROM public.schedule_events se
  LEFT JOIN public.reservations r ON r.schedule_event_id = se.id
  WHERE COALESCE(se.current_participants, 0) > 0
  GROUP BY se.id
  HAVING COUNT(r.id) = 0
) AS gaps;

