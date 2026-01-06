-- schedule_events テーブルに is_tentative カラムを追加
-- 仮状態（非公開）を管理するためのフラグ

-- カラムが存在しない場合のみ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schedule_events'
    AND column_name = 'is_tentative'
  ) THEN
    ALTER TABLE schedule_events
    ADD COLUMN is_tentative BOOLEAN DEFAULT FALSE;
    
    -- コメント追加
    COMMENT ON COLUMN schedule_events.is_tentative IS '仮状態フラグ - trueの場合は非公開扱い';
  END IF;
END $$;

-- インデックスを作成（仮状態のフィルタリング用）
CREATE INDEX IF NOT EXISTS idx_schedule_events_is_tentative 
ON schedule_events(is_tentative) 
WHERE is_tentative = TRUE;

