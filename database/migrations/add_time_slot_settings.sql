-- 公演時間帯のデフォルト設定を organization_settings に追加
-- 平日と休日・祝日で異なる設定が可能

-- まず organization_settings テーブルが存在しない場合は作成
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Discord設定
  discord_bot_token TEXT,
  discord_webhook_url TEXT,
  discord_channel_id TEXT,
  discord_private_booking_channel_id TEXT,
  discord_shift_channel_id TEXT,
  discord_public_key TEXT,
  
  -- メール設定
  resend_api_key TEXT,
  sender_email TEXT,
  sender_name TEXT,
  reply_to_email TEXT,
  
  -- LINE設定
  line_channel_access_token TEXT,
  line_channel_secret TEXT,
  
  -- Google設定
  google_sheets_id TEXT,
  google_service_account_key JSONB,
  
  -- 通知設定
  notification_settings JSONB,
  
  -- 公演時間帯設定
  time_slot_settings JSONB DEFAULT '{
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
  }'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- テーブルが既に存在する場合は time_slot_settings カラムのみ追加
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

-- RLSを有効化
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（既存があれば削除して再作成）
DROP POLICY IF EXISTS organization_settings_select ON organization_settings;
DROP POLICY IF EXISTS organization_settings_insert ON organization_settings;
DROP POLICY IF EXISTS organization_settings_update ON organization_settings;

CREATE POLICY organization_settings_select ON organization_settings
  FOR SELECT USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );

CREATE POLICY organization_settings_insert ON organization_settings
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id() OR is_org_admin()
  );

CREATE POLICY organization_settings_update ON organization_settings
  FOR UPDATE USING (
    organization_id = get_user_organization_id() OR is_org_admin()
  );

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

