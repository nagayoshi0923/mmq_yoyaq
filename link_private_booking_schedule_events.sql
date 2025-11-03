-- 過去の貸切予約にschedule_event_idを紐付けるSQLスクリプト
-- Supabase Dashboard の SQL Editor で実行してください

-- ============================================
-- ステップ1: 未紐付けの貸切予約を確認
-- ============================================
SELECT 
  r.id,
  r.reservation_number,
  r.status,
  r.store_id,
  r.title,
  r.scenario_id,
  s.title as scenario_title,
  r.candidate_datetimes->'confirmedStore'->>'storeId' as confirmed_store_id,
  jsonb_array_length(COALESCE(r.candidate_datetimes->'candidates', '[]'::jsonb)) as candidate_count
FROM reservations r
LEFT JOIN scenarios s ON r.scenario_id = s.id
WHERE r.reservation_source = 'web_private'
  AND r.status IN ('confirmed', 'gm_confirmed')
  AND r.schedule_event_id IS NULL
ORDER BY r.created_at DESC;

-- ============================================
-- ステップ2: マッチング確認（実行前の確認用）
-- ============================================
-- 未紐付けの貸切予約と、マッチする可能性のあるschedule_eventsを表示
SELECT 
  r.id as reservation_id,
  r.reservation_number,
  candidate->>'date' as candidate_date,
  candidate->>'startTime' as candidate_start_time,
  candidate->>'endTime' as candidate_end_time,
  COALESCE(r.store_id::text, r.candidate_datetimes->'confirmedStore'->>'storeId') as store_id,
  r.title as reservation_title,
  s.title as scenario_title,
  se.id as schedule_event_id,
  se.date,
  se.start_time,
  se.end_time,
  se.store_id as se_store_id,
  se.scenario,
  se.venue
FROM reservations r
CROSS JOIN LATERAL jsonb_array_elements(r.candidate_datetimes->'candidates') AS candidate
LEFT JOIN scenarios s ON r.scenario_id = s.id
LEFT JOIN schedule_events se ON (
  se.date::text = candidate->>'date'
  AND se.start_time::text = candidate->>'startTime'
  AND se.end_time::text = candidate->>'endTime'
  AND se.is_cancelled = false
  AND (
    se.store_id::text = COALESCE(r.store_id::text, r.candidate_datetimes->'confirmedStore'->>'storeId')
    OR se.venue = (SELECT name FROM stores WHERE id = COALESCE(r.store_id, (r.candidate_datetimes->'confirmedStore'->>'storeId')::uuid))
  )
  AND (
    se.scenario = r.title
    OR se.scenario = s.title
    OR se.scenario_id = r.scenario_id
  )
)
WHERE r.reservation_source = 'web_private'
  AND r.status IN ('confirmed', 'gm_confirmed')
  AND r.schedule_event_id IS NULL
  AND candidate->>'status' = 'confirmed'
ORDER BY r.created_at DESC, se.created_at ASC;

-- ============================================
-- ステップ3: 紐付け処理（実行前に上記で確認）
-- ============================================
-- 注意: このUPDATEは慎重に実行してください。まず上記のSELECTで確認してから実行してください。

-- 一時テーブルでマッチング結果を確認
WITH matched_events AS (
  SELECT DISTINCT ON (r.id)
    r.id as reservation_id,
    se.id as schedule_event_id
  FROM reservations r
  CROSS JOIN LATERAL jsonb_array_elements(r.candidate_datetimes->'candidates') AS candidate
  LEFT JOIN scenarios s ON r.scenario_id = s.id
  INNER JOIN schedule_events se ON (
    se.date::text = candidate->>'date'
    AND se.start_time::text = candidate->>'startTime'
    AND se.end_time::text = candidate->>'endTime'
    AND se.is_cancelled = false
    AND (
      se.store_id::text = COALESCE(r.store_id::text, r.candidate_datetimes->'confirmedStore'->>'storeId')
      OR se.venue = (
        SELECT name FROM stores 
        WHERE id = COALESCE(r.store_id, (r.candidate_datetimes->'confirmedStore'->>'storeId')::uuid)
      )
    )
    AND (
      se.scenario = r.title
      OR se.scenario = s.title
      OR se.scenario_id = r.scenario_id
    )
  )
  WHERE r.reservation_source = 'web_private'
    AND r.status IN ('confirmed', 'gm_confirmed')
    AND r.schedule_event_id IS NULL
    AND candidate->>'status' = 'confirmed'
  ORDER BY r.id, se.created_at ASC
)
-- 紐付け実行（コメントアウトを外して実行）
/*
UPDATE reservations r
SET schedule_event_id = me.schedule_event_id
FROM matched_events me
WHERE r.id = me.reservation_id;
*/

-- ============================================
-- ステップ4: 紐付け結果を確認
-- ============================================
SELECT 
  r.id,
  r.reservation_number,
  r.schedule_event_id,
  r.status,
  se.date,
  se.start_time,
  se.end_time,
  se.scenario,
  se.venue,
  CASE 
    WHEN r.schedule_event_id IS NOT NULL THEN '✅ 紐付け済み'
    ELSE '⚠️  未紐付け'
  END as link_status
FROM reservations r
LEFT JOIN schedule_events se ON r.schedule_event_id = se.id
WHERE r.reservation_source = 'web_private'
  AND r.status IN ('confirmed', 'gm_confirmed')
ORDER BY r.created_at DESC;

