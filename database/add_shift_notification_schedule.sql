-- notification_settingsにシフト通知スケジュール設定を追加

DO $$
BEGIN
  -- shift_notification_day カラム（募集通知日）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' 
    AND column_name = 'shift_notification_day'
  ) THEN
    ALTER TABLE notification_settings
    ADD COLUMN shift_notification_day INTEGER DEFAULT 25 CHECK (shift_notification_day >= 1 AND shift_notification_day <= 31);
  END IF;
  
  -- shift_deadline_day カラム（締切日）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' 
    AND column_name = 'shift_deadline_day'
  ) THEN
    ALTER TABLE notification_settings
    ADD COLUMN shift_deadline_day INTEGER DEFAULT 25 CHECK (shift_deadline_day >= 1 AND shift_deadline_day <= 31);
  END IF;
END $$;

-- 確認クエリ
SELECT 
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'notification_settings'
  AND column_name LIKE '%shift%'
ORDER BY ordinal_position;

