-- =============================================================================
-- DIAG TS-1: シンプルなデータカウント（置換不要・全部コピペOK）
-- =============================================================================
-- RLSに関係なく、テーブルの行数を直接カウントします。
-- Supabase SQL Editor は service_role で実行されるため RLS はバイパスされます。
-- =============================================================================

-- (1) 全テーブルの行数
SELECT 'schedule_events' AS table_name, COUNT(*) AS row_count FROM public.schedule_events
UNION ALL
SELECT 'reservations', COUNT(*) FROM public.reservations
UNION ALL
SELECT 'reservations_history', COUNT(*) FROM public.reservations_history
UNION ALL
SELECT 'schedule_event_history', COUNT(*) FROM public.schedule_event_history
UNION ALL
SELECT 'organizations', COUNT(*) FROM public.organizations
UNION ALL
SELECT 'customers', COUNT(*) FROM public.customers;

-- (2) schedule_events の current_participants 状態
SELECT 
  'schedule_events_participants' AS section,
  COUNT(*) AS total_events,
  SUM(CASE WHEN COALESCE(current_participants, 0) > 0 THEN 1 ELSE 0 END) AS events_with_participants,
  SUM(COALESCE(current_participants, 0)) AS total_participants_sum
FROM public.schedule_events;

-- (3) reservations の状態
SELECT 
  'reservations_status' AS section,
  COUNT(*) AS total,
  SUM(CASE WHEN schedule_event_id IS NULL THEN 1 ELSE 0 END) AS orphan_count,
  SUM(CASE WHEN status IN ('pending','confirmed','gm_confirmed') THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count
FROM public.reservations;

-- (4) 組織一覧
SELECT 'organizations_list' AS section, id, name 
FROM public.organizations 
ORDER BY created_at DESC 
LIMIT 5;

-- (5) 直近の予約（10件）
SELECT 
  'recent_reservations' AS section,
  id,
  organization_id,
  schedule_event_id,
  status,
  reservation_source,
  customer_name,
  participant_count,
  created_at
FROM public.reservations
ORDER BY created_at DESC
LIMIT 10;

-- (6) current_participants > 0 のイベント（10件）
SELECT 
  'events_with_participants' AS section,
  id,
  organization_id,
  date,
  start_time,
  scenario,
  current_participants,
  max_participants
FROM public.schedule_events
WHERE COALESCE(current_participants, 0) > 0
ORDER BY date DESC
LIMIT 10;

