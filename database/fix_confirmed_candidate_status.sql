-- reservations.status='confirmed' なのに candidate.status='pending' になっているデータを修正

-- 1. 修正対象を確認
SELECT 
  id, 
  customer_name,
  status as reservation_status,
  candidate_datetimes->'candidates'->0->>'status' as candidate_status,
  candidate_datetimes
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND (candidate_datetimes->'candidates'->0->>'status' IS NULL 
       OR candidate_datetimes->'candidates'->0->>'status' = 'pending');

-- 2. 候補のstatusを'confirmed'に更新
UPDATE reservations
SET 
  candidate_datetimes = jsonb_set(
    candidate_datetimes,
    '{candidates,0,status}',
    '"confirmed"'
  ),
  updated_at = NOW()
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
  AND (candidate_datetimes->'candidates'->0->>'status' IS NULL 
       OR candidate_datetimes->'candidates'->0->>'status' = 'pending');

-- 3. 更新後の確認
SELECT 
  id, 
  customer_name,
  status as reservation_status,
  candidate_datetimes->'candidates'->0->>'status' as candidate_status,
  candidate_datetimes->'candidates'->0->>'date' as candidate_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as candidate_timeSlot
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
ORDER BY created_at DESC;

