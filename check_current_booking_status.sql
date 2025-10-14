-- 現在の貸切リクエストのステータスを確認（古城の呪い）
SELECT 
  id,
  title,
  status,
  created_at,
  updated_at
FROM reservations 
WHERE title LIKE '%古城の呪い%'
  AND reservation_source = 'web_private'
ORDER BY created_at DESC
LIMIT 5;
