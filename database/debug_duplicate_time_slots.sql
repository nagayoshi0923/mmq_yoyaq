-- 同じ日・同じシナリオで複数の時間帯に表示されている問題を調査

-- 1. 「学園の秘密」の確定済み貸切リクエストを全て表示
SELECT 
  id,
  customer_name,
  status,
  store_id,
  gm_staff,
  candidate_datetimes,
  created_at,
  updated_at
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND candidate_datetimes->'candidates' @> '[{"date":"2025-10-14"}]'::jsonb
ORDER BY updated_at DESC;

-- 2. 各候補の詳細を表示
SELECT 
  id,
  customer_name,
  status as reservation_status,
  store_id,
  elem->>'order' as candidate_order,
  elem->>'date' as candidate_date,
  elem->>'timeSlot' as candidate_slot,
  elem->>'startTime' as start_time,
  elem->>'endTime' as end_time,
  elem->>'status' as candidate_status,
  updated_at
FROM reservations,
LATERAL jsonb_array_elements(candidate_datetimes->'candidates') elem
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND elem->>'date' = '2025-10-14'
ORDER BY updated_at DESC, (elem->>'order')::int;

-- 3. schedule_eventsテーブルも確認（通常公演との重複チェック）
SELECT 
  id,
  title,
  date,
  start_time,
  end_time,
  store_id,
  category,
  is_reservation_enabled,
  current_participants,
  max_participants
FROM schedule_events
WHERE date = '2025-10-14'
  AND title LIKE '%学園の秘密%'
ORDER BY start_time;

