-- 重複している貸切リクエストを確認

-- 1. 同じ日時・シナリオで複数のレコードがあるものを確認
SELECT 
  candidate_datetimes->'candidates'->0->>'date' as event_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
  scenario_id,
  store_id,
  COUNT(*) as duplicate_count,
  array_agg(id ORDER BY created_at) as reservation_ids,
  array_agg(created_at ORDER BY created_at) as created_dates
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
GROUP BY 
  candidate_datetimes->'candidates'->0->>'date',
  candidate_datetimes->'candidates'->0->>'timeSlot',
  scenario_id,
  store_id
HAVING COUNT(*) > 1
ORDER BY 
  candidate_datetimes->'candidates'->0->>'date',
  candidate_datetimes->'candidates'->0->>'timeSlot';

-- 2. 詳細情報を表示
SELECT 
  id,
  created_at,
  customer_name,
  candidate_datetimes->'candidates'->0->>'date' as event_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
  scenarios.title as scenario_title,
  stores.name as store_name
FROM reservations
LEFT JOIN scenarios ON reservations.scenario_id = scenarios.id
LEFT JOIN stores ON reservations.store_id = stores.id
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
ORDER BY 
  candidate_datetimes->'candidates'->0->>'date',
  candidate_datetimes->'candidates'->0->>'timeSlot',
  created_at;

