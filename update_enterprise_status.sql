-- 企業の陰謀リクエストのステータスを pending_store に更新
UPDATE reservations 
SET status = 'pending_store', updated_at = NOW()
WHERE title LIKE '%企業の陰謀%' 
  AND status IN ('pending', 'pending_gm');
