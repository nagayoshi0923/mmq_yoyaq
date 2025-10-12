-- 10/14の重複している貸切リクエストを詳しく調査

-- 1. 10/14の全ての確定済み貸切リクエストを表示
SELECT 
  id,
  customer_name,
  customer_email,
  status,
  store_id,
  gm_staff,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count,
  candidate_datetimes->'candidates' as all_candidates,
  candidate_datetimes->'confirmedStore' as confirmed_store,
  created_at,
  updated_at
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND candidate_datetimes->'candidates'->0->>'date' LIKE '2025-10-14%'
ORDER BY customer_name, created_at;

-- 2. 各候補のステータスを個別に表示
SELECT 
  id,
  customer_name,
  status as reservation_status,
  elem->>'order' as candidate_order,
  elem->>'date' as candidate_date,
  elem->>'timeSlot' as candidate_slot,
  elem->>'status' as candidate_status
FROM reservations,
LATERAL jsonb_array_elements(candidate_datetimes->'candidates') elem
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND elem->>'date' LIKE '2025-10-14%'
ORDER BY customer_name, (elem->>'order')::int;

-- 3. 同じ顧客・シナリオで複数のreservationsレコードがあるかチェック
SELECT 
  customer_name,
  customer_email,
  scenario_id,
  COUNT(*) as record_count,
  string_agg(id::text, ', ') as reservation_ids
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND candidate_datetimes->'candidates'->0->>'date' LIKE '2025-10-14%'
GROUP BY customer_name, customer_email, scenario_id
HAVING COUNT(*) > 1;

