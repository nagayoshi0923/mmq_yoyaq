-- 現在のリクエストのステータスを確認
SELECT 
  id,
  title,
  status,
  candidate_datetimes,
  created_at,
  updated_at
FROM reservations 
WHERE reservation_source = 'web_private'
ORDER BY created_at DESC
LIMIT 10;
