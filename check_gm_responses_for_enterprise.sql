-- 企業の陰謀リクエストのGM回答を確認
SELECT 
  gar.*,
  r.title,
  r.status as reservation_status
FROM gm_availability_responses gar
JOIN reservations r ON gar.reservation_id = r.id
WHERE r.title LIKE '%企業の陰謀%'
ORDER BY gar.created_at DESC;
