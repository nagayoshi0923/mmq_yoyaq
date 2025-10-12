-- 重複している貸切リクエストのうち、最も新しい1件だけを残して削除

-- 注意: このクエリはデータを削除します。実行前に必ずバックアップを取ってください。

-- 1. 削除対象を確認（実行前に必ず確認）
WITH ranked_reservations AS (
  SELECT 
    id,
    created_at,
    customer_name,
    candidate_datetimes->'candidates'->0->>'date' as event_date,
    candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
    scenario_id,
    store_id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        candidate_datetimes->'candidates'->0->>'date',
        candidate_datetimes->'candidates'->0->>'timeSlot',
        scenario_id,
        store_id
      ORDER BY created_at DESC  -- 最新のものを残す
    ) as row_num
  FROM reservations 
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
)
SELECT 
  id,
  created_at,
  customer_name,
  event_date,
  time_slot,
  CASE WHEN row_num = 1 THEN '保持' ELSE '削除対象' END as action
FROM ranked_reservations
ORDER BY event_date, time_slot, created_at;

-- 2. 重複を削除（コメントを外して実行）
/*
WITH ranked_reservations AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY 
        candidate_datetimes->'candidates'->0->>'date',
        candidate_datetimes->'candidates'->0->>'timeSlot',
        scenario_id,
        store_id
      ORDER BY created_at DESC  -- 最新のものを残す
    ) as row_num
  FROM reservations 
  WHERE reservation_source = 'web_private' 
    AND status = 'confirmed'
)
DELETE FROM reservations
WHERE id IN (
  SELECT id 
  FROM ranked_reservations 
  WHERE row_num > 1
);
*/

-- 3. 削除後の確認
SELECT 
  candidate_datetimes->'candidates'->0->>'date' as event_date,
  candidate_datetimes->'candidates'->0->>'timeSlot' as time_slot,
  COUNT(*) as count
FROM reservations 
WHERE reservation_source = 'web_private' 
  AND status = 'confirmed'
GROUP BY 
  candidate_datetimes->'candidates'->0->>'date',
  candidate_datetimes->'candidates'->0->>'timeSlot'
HAVING COUNT(*) > 1;

