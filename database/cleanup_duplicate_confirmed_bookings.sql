-- 確定済み貸切リクエストの重複を削除
-- 同じ顧客の場合、最新の1件のみを残す

-- 1. 削除対象を確認
SELECT 
  id,
  customer_name,
  candidate_datetimes->'candidates'->0->>'date' as event_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
  created_at,
  '削除対象' as action
FROM reservations
WHERE id IN (
  SELECT id 
  FROM reservations
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
  ORDER BY customer_name, created_at DESC
)
AND id NOT IN (
  -- 顧客ごとの最新レコードを除外
  SELECT DISTINCT ON (customer_name) id
  FROM reservations
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
  ORDER BY customer_name, created_at DESC
);

-- 2. 削除を実行（コメントを外して実行）
/*
DELETE FROM reservations
WHERE id IN (
  SELECT id 
  FROM reservations
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
)
AND id NOT IN (
  -- 顧客ごとの最新レコードを除外
  SELECT DISTINCT ON (customer_name) id
  FROM reservations
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
  ORDER BY customer_name, created_at DESC
);
*/

-- 3. 削除後の確認
SELECT 
  customer_name,
  COUNT(*) as request_count,
  array_agg(
    candidate_datetimes->'candidates'->0->>'date' 
    ORDER BY candidate_datetimes->'candidates'->0->>'date'
  ) as all_dates
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
GROUP BY customer_name;

