-- シフト通知管理テーブル

-- シフト募集通知の送信記録
CREATE TABLE IF NOT EXISTS shift_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  channel_id TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shift_notifications_year_month ON shift_notifications(year, month);
CREATE INDEX IF NOT EXISTS idx_shift_notifications_sent_at ON shift_notifications(sent_at);

-- 通知設定テーブルにシフト関連カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' 
    AND column_name = 'discord_shift_channel_id'
  ) THEN
    ALTER TABLE notification_settings
    ADD COLUMN discord_shift_channel_id TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' 
    AND column_name = 'shift_notification_enabled'
  ) THEN
    ALTER TABLE notification_settings
    ADD COLUMN shift_notification_enabled BOOLEAN DEFAULT true;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'notification_settings' 
    AND column_name = 'shift_reminder_days'
  ) THEN
    ALTER TABLE notification_settings
    ADD COLUMN shift_reminder_days INTEGER DEFAULT 3;
  END IF;
END $$;

-- RLS有効化
ALTER TABLE shift_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON shift_notifications
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON shift_notifications
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 確認クエリ
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'shift_notifications'
ORDER BY ordinal_position;

SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'notification_settings'
  AND column_name LIKE '%shift%'
ORDER BY ordinal_position;

