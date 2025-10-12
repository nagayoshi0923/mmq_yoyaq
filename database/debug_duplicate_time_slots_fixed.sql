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
ORDER BY updated_at DESC
LIMIT 5;

-- 2. 各候補の詳細を表示（全ての確定済み貸切）
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
ORDER BY updated_at DESC, (elem->>'order')::int;

-- 3. 候補が複数ある確定済みリクエストを探す
SELECT 
  id,
  customer_name,
  status,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count,
  candidate_datetimes->'candidates' as all_candidates
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND jsonb_array_length(candidate_datetimes->'candidates') > 1
ORDER BY updated_at DESC;

