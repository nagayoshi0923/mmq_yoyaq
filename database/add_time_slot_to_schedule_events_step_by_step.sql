-- ========================================
-- ステップ1: カラム追加
-- ========================================
ALTER TABLE schedule_events 
ADD COLUMN IF NOT EXISTS time_slot TEXT;

-- ========================================
-- ステップ2: 既存データの更新（17時を含めて「昼」に分類）
-- ========================================
UPDATE schedule_events
SET time_slot = CASE
  WHEN EXTRACT(HOUR FROM start_time) < 12 THEN '朝'
  WHEN EXTRACT(HOUR FROM start_time) <= 17 THEN '昼'
  ELSE '夜'
END
WHERE time_slot IS NULL;

