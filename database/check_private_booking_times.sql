-- 貸切公演の時間情報を確認
SELECT 
  id,
  customer_name,
  status,
  store_id,
  gm_staff,
  candidate_datetimes->'candidates'->0->>'date' as candidate_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
  candidate_datetimes->'candidates'->0->>'startTime' as start_time,
  candidate_datetimes->'candidates'->0->>'endTime' as end_time,
  candidate_datetimes->'candidates'->0->>'status' as candidate_status,
  created_at,
  updated_at
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
ORDER BY created_at DESC;

