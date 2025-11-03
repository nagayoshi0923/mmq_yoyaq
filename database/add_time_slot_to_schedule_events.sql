-- schedule_eventsテーブルにtime_slotカラムを追加
-- 通常公演の時間帯（朝/昼/夜）を保存するため

ALTER TABLE schedule_events 
ADD COLUMN IF NOT EXISTS time_slot TEXT;

-- 既存データに対して、start_timeからtime_slotを推定して設定
-- 17時開始も「昼」に分類
UPDATE schedule_events
SET time_slot = CASE
  WHEN EXTRACT(HOUR FROM start_time) < 12 THEN '朝'
  WHEN EXTRACT(HOUR FROM start_time) <= 17 THEN '昼'
  ELSE '夜'
END
WHERE time_slot IS NULL;

-- コメント追加（PostgreSQLでCOMMENT構文が使える場合）
COMMENT ON COLUMN schedule_events.time_slot IS '時間帯（朝/昼/夜）';

