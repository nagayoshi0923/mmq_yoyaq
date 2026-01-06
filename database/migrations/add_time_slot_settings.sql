-- 公演時間帯のデフォルト設定を organization_settings に追加
-- 平日と休日・祝日で異なる設定が可能

-- time_slot_settings カラムを追加
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS time_slot_settings JSONB DEFAULT '{
  "weekday": {
    "morning": { "start_time": "10:00", "end_time": "14:00" },
    "afternoon": { "start_time": "14:30", "end_time": "18:30" },
    "evening": { "start_time": "19:00", "end_time": "23:00" }
  },
  "holiday": {
    "morning": { "start_time": "10:00", "end_time": "14:00" },
    "afternoon": { "start_time": "14:30", "end_time": "18:30" },
    "evening": { "start_time": "19:00", "end_time": "23:00" }
  }
}'::jsonb;

COMMENT ON COLUMN organization_settings.time_slot_settings IS '公演時間帯のデフォルト設定。weekday=平日、holiday=休日・祝日';

-- 既存のレコードにデフォルト値を設定
UPDATE organization_settings
SET time_slot_settings = '{
  "weekday": {
    "morning": { "start_time": "10:00", "end_time": "14:00" },
    "afternoon": { "start_time": "14:30", "end_time": "18:30" },
    "evening": { "start_time": "19:00", "end_time": "23:00" }
  },
  "holiday": {
    "morning": { "start_time": "10:00", "end_time": "14:00" },
    "afternoon": { "start_time": "14:30", "end_time": "18:30" },
    "evening": { "start_time": "19:00", "end_time": "23:00" }
  }
}'::jsonb
WHERE time_slot_settings IS NULL;

