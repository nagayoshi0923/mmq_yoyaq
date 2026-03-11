-- =============================================================================
-- スケジュール画面の予約者データ診断クエリ
-- ステージング環境で実行して、データの状態を確認してください
-- =============================================================================

-- 1. schedule_events テーブルの current_participants が 0 以外のイベント数
SELECT 
  'schedule_events with current_participants > 0' as check_item,
  COUNT(*) as count
FROM schedule_events
WHERE current_participants > 0
  AND date >= CURRENT_DATE - INTERVAL '30 days';

-- 2. reservations テーブルの有効な予約数
SELECT 
  'active reservations (confirmed/pending/gm_confirmed)' as check_item,
  COUNT(*) as count
FROM reservations
WHERE status IN ('confirmed', 'pending', 'gm_confirmed')
  AND requested_datetime >= CURRENT_DATE - INTERVAL '30 days';

-- 3. schedule_event_id が設定されている予約の数
SELECT 
  'reservations with schedule_event_id set' as check_item,
  COUNT(*) as count
FROM reservations
WHERE schedule_event_id IS NOT NULL
  AND status IN ('confirmed', 'pending', 'gm_confirmed')
  AND requested_datetime >= CURRENT_DATE - INTERVAL '30 days';

-- 4. 予約はあるが schedule_events.current_participants が 0 のイベント
SELECT 
  'events with reservations but current_participants = 0' as check_item,
  COUNT(DISTINCT se.id) as count
FROM schedule_events se
JOIN reservations r ON r.schedule_event_id = se.id
WHERE r.status IN ('confirmed', 'pending', 'gm_confirmed')
  AND se.current_participants = 0
  AND se.date >= CURRENT_DATE - INTERVAL '30 days';

-- 5. 詳細: 予約はあるが参加者数が 0 のイベント一覧（最新10件）
SELECT 
  se.id,
  se.date,
  se.start_time,
  se.scenario,
  se.current_participants as se_participants,
  COALESCE(SUM(r.participant_count) FILTER (WHERE r.status IN ('confirmed', 'pending', 'gm_confirmed')), 0) as actual_participants,
  se.organization_id
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id
WHERE se.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY se.id, se.date, se.start_time, se.scenario, se.current_participants, se.organization_id
HAVING se.current_participants = 0 
   AND COALESCE(SUM(r.participant_count) FILTER (WHERE r.status IN ('confirmed', 'pending', 'gm_confirmed')), 0) > 0
ORDER BY se.date DESC, se.start_time DESC
LIMIT 10;

-- 6. organization_id の整合性チェック: schedule_events と reservations で organization_id が一致しているか
SELECT 
  'reservations with mismatched organization_id' as check_item,
  COUNT(*) as count
FROM reservations r
JOIN schedule_events se ON r.schedule_event_id = se.id
WHERE r.organization_id IS DISTINCT FROM se.organization_id
  AND r.status IN ('confirmed', 'pending', 'gm_confirmed');

-- 7. schedule_events の organization_id が NULL のレコード数
SELECT 
  'schedule_events with NULL organization_id' as check_item,
  COUNT(*) as count
FROM schedule_events
WHERE organization_id IS NULL
  AND date >= CURRENT_DATE - INTERVAL '30 days';

-- 8. reservations の organization_id が NULL のレコード数
SELECT 
  'reservations with NULL organization_id' as check_item,
  COUNT(*) as count
FROM reservations
WHERE organization_id IS NULL
  AND status IN ('confirmed', 'pending', 'gm_confirmed');

-- 9. 予約テーブルの参加者数と schedule_events.current_participants の比較
-- 不整合があるレコードを表示
SELECT 
  se.id as event_id,
  se.date,
  se.start_time,
  se.scenario,
  se.current_participants as se_count,
  COALESCE(SUM(r.participant_count) FILTER (WHERE r.status IN ('confirmed', 'pending', 'gm_confirmed')), 0) as reservation_count,
  se.organization_id
FROM schedule_events se
LEFT JOIN reservations r ON r.schedule_event_id = se.id AND r.organization_id = se.organization_id
WHERE se.date >= CURRENT_DATE
  AND se.date <= CURRENT_DATE + INTERVAL '30 days'
  AND se.is_cancelled = false
GROUP BY se.id, se.date, se.start_time, se.scenario, se.current_participants, se.organization_id
HAVING se.current_participants != COALESCE(SUM(r.participant_count) FILTER (WHERE r.status IN ('confirmed', 'pending', 'gm_confirmed')), 0)
ORDER BY se.date, se.start_time
LIMIT 20;

-- 10. 各組織のデータ数を確認
SELECT 
  o.name as org_name,
  o.id as org_id,
  (SELECT COUNT(*) FROM schedule_events WHERE organization_id = o.id AND date >= CURRENT_DATE) as future_events,
  (SELECT COUNT(*) FROM reservations WHERE organization_id = o.id AND status IN ('confirmed', 'pending', 'gm_confirmed')) as active_reservations
FROM organizations o
ORDER BY o.name;
