-- 同じセル（日付・店舗・時間帯）に複数のイベントがある場合、最新の1件のみを残して削除
-- スケジュール管理画面の表示準拠：同じセルに2個以上のイベントは発生させない

-- 注意: このクエリはデータを削除します。実行前に必ずバックアップを取ってください。

-- 1. 削除対象を確認（実行前に必ず確認）
WITH time_slot_events AS (
  SELECT 
    id,
    date,
    COALESCE(store_id, venue::uuid) as store_id,
    start_time,
    CASE 
      WHEN EXTRACT(HOUR FROM start_time) < 12 THEN 'morning'
      WHEN EXTRACT(HOUR FROM start_time) <= 17 THEN 'afternoon'
      ELSE 'evening'
    END as time_slot,
    created_at,
    updated_at,
    category,
    is_cancelled,
    scenario
  FROM schedule_events
  WHERE is_cancelled = false
),
ranked_events AS (
  SELECT 
    id,
    date,
    store_id,
    time_slot,
    created_at,
    updated_at,
    category,
    scenario,
    ROW_NUMBER() OVER (
      PARTITION BY date, store_id, time_slot
      ORDER BY updated_at DESC, created_at DESC  -- 最新のものを残す
    ) as row_num
  FROM time_slot_events
)
SELECT 
  id,
  date,
  store_id,
  time_slot,
  category,
  scenario,
  created_at,
  updated_at,
  CASE WHEN row_num = 1 THEN '保持' ELSE '削除対象' END as action
FROM ranked_events
WHERE row_num > 1
ORDER BY date, store_id, time_slot, updated_at DESC;

-- 2. 削除を実行（コメントを外して実行）
/*
WITH time_slot_events AS (
  SELECT 
    id,
    date,
    COALESCE(store_id, venue::uuid) as store_id,
    start_time,
    CASE 
      WHEN EXTRACT(HOUR FROM start_time) < 12 THEN 'morning'
      WHEN EXTRACT(HOUR FROM start_time) <= 17 THEN 'afternoon'
      ELSE 'evening'
    END as time_slot,
    updated_at,
    created_at
  FROM schedule_events
  WHERE is_cancelled = false
),
ranked_events AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY date, store_id, time_slot
      ORDER BY updated_at DESC, created_at DESC  -- 最新のものを残す
    ) as row_num
  FROM time_slot_events
)
DELETE FROM schedule_events
WHERE id IN (
  SELECT id 
  FROM ranked_events 
  WHERE row_num > 1
);
*/

-- 3. 削除後の確認
WITH time_slot_events AS (
  SELECT 
    date,
    COALESCE(store_id, venue::uuid) as store_id,
    start_time,
    CASE 
      WHEN EXTRACT(HOUR FROM start_time) < 12 THEN 'morning'
      WHEN EXTRACT(HOUR FROM start_time) <= 17 THEN 'afternoon'
      ELSE 'evening'
    END as time_slot
  FROM schedule_events
  WHERE is_cancelled = false
)
SELECT 
  date,
  store_id,
  time_slot,
  COUNT(*) as event_count
FROM time_slot_events
GROUP BY date, store_id, time_slot
HAVING COUNT(*) > 1
ORDER BY date, store_id, time_slot;

