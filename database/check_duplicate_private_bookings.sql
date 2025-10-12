-- 同じ顧客の確定済み貸切リクエストが複数存在するかチェック

-- 1. 同じ顧客名で複数の確定済みリクエストがあるか確認
SELECT 
  customer_name,
  customer_email,
  COUNT(*) as count
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
GROUP BY customer_name, customer_email
HAVING COUNT(*) > 1;

-- 2. 詳細を表示
SELECT 
  id,
  customer_name,
  customer_email,
  status,
  scenario_id,
  store_id,
  gm_staff,
  candidate_datetimes->'candidates'->0->>'date' as first_candidate_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as first_candidate_slot,
  jsonb_array_length(candidate_datetimes->'candidates') as candidate_count,
  created_at,
  updated_at
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
ORDER BY customer_name, created_at DESC;

-- 3. 同じシナリオ・同じ日時・同じ店舗で複数の確定がないかチェック
WITH confirmed_bookings AS (
  SELECT 
    id,
    customer_name,
    scenario_id,
    store_id,
    candidate_datetimes->'candidates'->0->>'date' as event_date,
    candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
    created_at
  FROM reservations 
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
)
SELECT 
  scenario_id,
  store_id,
  event_date,
  time_slot,
  COUNT(*) as duplicate_count,
  string_agg(customer_name || ' (' || id || ')', ', ') as customers
FROM confirmed_bookings
GROUP BY scenario_id, store_id, event_date, time_slot
HAVING COUNT(*) > 1;

