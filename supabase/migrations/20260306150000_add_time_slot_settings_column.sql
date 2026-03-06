-- organization_settings に time_slot_settings カラムを追加
-- フロントエンドで参照しているが、DBに存在しないためエラーになっていた

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS time_slot_settings JSONB DEFAULT '{
    "weekday": {
      "morning": {"start_time": "10:00", "end_time": "12:00"},
      "afternoon": {"start_time": "13:00", "end_time": "17:00"},
      "evening": {"start_time": "17:00", "end_time": "21:00"}
    },
    "holiday": {
      "morning": {"start_time": "10:00", "end_time": "12:00"},
      "afternoon": {"start_time": "13:00", "end_time": "17:00"},
      "evening": {"start_time": "17:00", "end_time": "21:00"}
    }
  }'::jsonb;

COMMENT ON COLUMN public.organization_settings.time_slot_settings IS 
  '公演時間帯設定（平日/休日ごとの朝/昼/夜）';
