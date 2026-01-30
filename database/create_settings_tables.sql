-- 設定テーブルの作成スクリプト
-- このスクリプトをSupabase SQL Editorで実行してください

-- 1. 店舗基本設定テーブル
CREATE TABLE IF NOT EXISTS store_basic_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  store_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website_url TEXT,
  business_license_number TEXT,
  tax_id TEXT,
  bank_account_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 2. 営業時間設定テーブル
CREATE TABLE IF NOT EXISTS business_hours_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  opening_hours JSONB, -- { monday: { is_open: true, open_time: "10:00", close_time: "22:00" }, ... }
  holidays TEXT[], -- ["2024-01-01", "2024-12-31"]
  time_restrictions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 3. 公演スケジュール設定テーブル
CREATE TABLE IF NOT EXISTS performance_schedule_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  performances_per_day INTEGER DEFAULT 2,
  performance_times JSONB, -- [{ slot: "afternoon", start_time: "14:00" }, { slot: "evening", start_time: "18:00" }]
  preparation_time INTEGER DEFAULT 30, -- 分単位
  default_duration INTEGER DEFAULT 180, -- 分単位
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 4. 予約設定テーブル
CREATE TABLE IF NOT EXISTS reservation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  max_participants_per_booking INTEGER DEFAULT 8,
  advance_booking_days INTEGER DEFAULT 90,
  same_day_booking_cutoff INTEGER DEFAULT 0, -- 時間単位（0 の場合は公演開始まで）
  cancellation_policy TEXT,
  cancellation_deadline_hours INTEGER DEFAULT 24,
  max_bookings_per_customer INTEGER,
  require_phone_verification BOOLEAN DEFAULT false,
  -- キャンセル料金設定（時間前による段階的な料金設定）
  cancellation_fees JSONB DEFAULT '[
    {"hours_before": 168, "fee_percentage": 0, "description": "1週間前まで無料"},
    {"hours_before": 72, "fee_percentage": 30, "description": "3日前まで30%"},
    {"hours_before": 24, "fee_percentage": 50, "description": "前日まで50%"},
    {"hours_before": 0, "fee_percentage": 100, "description": "当日100%"}
  ]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 5. 料金設定テーブル
CREATE TABLE IF NOT EXISTS pricing_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  base_price INTEGER DEFAULT 3000,
  time_slot_pricing JSONB, -- { morning: 0, afternoon: 0, evening: 500 }
  group_discounts JSONB, -- [{ min_participants: 4, discount: 10 }]
  member_discount INTEGER DEFAULT 0,
  tax_rate DECIMAL(4,2) DEFAULT 10.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 6. メール設定テーブル
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  reservation_confirmation_enabled BOOLEAN DEFAULT true,
  reservation_confirmation_template TEXT,
  cancellation_confirmation_enabled BOOLEAN DEFAULT true,
  cancellation_confirmation_template TEXT,
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_schedule JSONB, -- [{ days_before: 1, time: "09:00", enabled: true, template: "..." }]
  reminder_time TIME DEFAULT '09:00',
  reminder_send_time TEXT DEFAULT 'morning',
  company_name TEXT DEFAULT 'クイーンズワルツ',
  company_phone TEXT,
  company_email TEXT,
  company_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 7. 通知設定テーブル
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  new_reservation_email BOOLEAN DEFAULT true,
  new_reservation_discord BOOLEAN DEFAULT false,
  cancellation_email BOOLEAN DEFAULT true,
  cancellation_discord BOOLEAN DEFAULT false,
  shift_reminder_days INTEGER DEFAULT 7,
  performance_reminder_days INTEGER DEFAULT 1,
  sales_report_notification BOOLEAN DEFAULT true,
  discord_webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 8. スタッフ設定テーブル
CREATE TABLE IF NOT EXISTS staff_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  default_main_gm_reward INTEGER DEFAULT 2000,
  default_sub_gm_reward INTEGER DEFAULT 1500,
  shift_deadline_days INTEGER DEFAULT 14,
  staff_rank_enabled BOOLEAN DEFAULT false,
  training_period_days INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 9. システム設定テーブル
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  timezone TEXT DEFAULT 'Asia/Tokyo',
  date_format TEXT DEFAULT 'YYYY-MM-DD',
  currency TEXT DEFAULT 'JPY',
  language TEXT DEFAULT 'ja',
  maintenance_mode BOOLEAN DEFAULT false,
  backup_frequency TEXT DEFAULT 'daily',
  session_timeout_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 10. 顧客設定テーブル
CREATE TABLE IF NOT EXISTS customer_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  require_membership BOOLEAN DEFAULT false,
  loyalty_points_enabled BOOLEAN DEFAULT false,
  points_per_yen INTEGER DEFAULT 1,
  review_system_enabled BOOLEAN DEFAULT true,
  referral_reward INTEGER DEFAULT 0,
  birthday_discount INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 11. データ管理設定テーブル
CREATE TABLE IF NOT EXISTS data_management_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  data_retention_days INTEGER DEFAULT 730, -- 2年
  auto_archive_enabled BOOLEAN DEFAULT true,
  gdpr_compliance_enabled BOOLEAN DEFAULT true,
  export_format TEXT DEFAULT 'csv',
  backup_location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 12. 売上レポート設定テーブル
CREATE TABLE IF NOT EXISTS sales_report_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  report_frequency TEXT DEFAULT 'monthly', -- daily, weekly, monthly
  report_send_day INTEGER DEFAULT 1, -- 月の何日に送信するか
  report_recipients TEXT[],
  include_tax_breakdown BOOLEAN DEFAULT true,
  include_scenario_breakdown BOOLEAN DEFAULT true,
  include_gm_costs BOOLEAN DEFAULT true,
  author_report_day INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- RLS (Row Level Security) を有効化
ALTER TABLE store_basic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_management_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_report_settings ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー（管理者のみアクセス可能）
-- 既存のポリシーを削除してから作成
DROP POLICY IF EXISTS store_basic_settings_policy ON store_basic_settings;
CREATE POLICY store_basic_settings_policy ON store_basic_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS business_hours_settings_policy ON business_hours_settings;
CREATE POLICY business_hours_settings_policy ON business_hours_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS performance_schedule_settings_policy ON performance_schedule_settings;
CREATE POLICY performance_schedule_settings_policy ON performance_schedule_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS reservation_settings_policy ON reservation_settings;
CREATE POLICY reservation_settings_policy ON reservation_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS pricing_settings_policy ON pricing_settings;
CREATE POLICY pricing_settings_policy ON pricing_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS email_settings_policy ON email_settings;
CREATE POLICY email_settings_policy ON email_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS notification_settings_policy ON notification_settings;
CREATE POLICY notification_settings_policy ON notification_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS staff_settings_policy ON staff_settings;
CREATE POLICY staff_settings_policy ON staff_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS system_settings_policy ON system_settings;
CREATE POLICY system_settings_policy ON system_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS customer_settings_policy ON customer_settings;
CREATE POLICY customer_settings_policy ON customer_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS data_management_settings_policy ON data_management_settings;
CREATE POLICY data_management_settings_policy ON data_management_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS sales_report_settings_policy ON sales_report_settings;
CREATE POLICY sales_report_settings_policy ON sales_report_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- updated_at自動更新のトリガーを追加
-- 既存のトリガーを削除してから作成
DROP TRIGGER IF EXISTS update_store_basic_settings_updated_at ON store_basic_settings;
CREATE TRIGGER update_store_basic_settings_updated_at BEFORE UPDATE ON store_basic_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_hours_settings_updated_at ON business_hours_settings;
CREATE TRIGGER update_business_hours_settings_updated_at BEFORE UPDATE ON business_hours_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_performance_schedule_settings_updated_at ON performance_schedule_settings;
CREATE TRIGGER update_performance_schedule_settings_updated_at BEFORE UPDATE ON performance_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_reservation_settings_updated_at ON reservation_settings;
CREATE TRIGGER update_reservation_settings_updated_at BEFORE UPDATE ON reservation_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pricing_settings_updated_at ON pricing_settings;
CREATE TRIGGER update_pricing_settings_updated_at BEFORE UPDATE ON pricing_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_settings_updated_at ON email_settings;
CREATE TRIGGER update_email_settings_updated_at BEFORE UPDATE ON email_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_settings_updated_at ON notification_settings;
CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_settings_updated_at ON staff_settings;
CREATE TRIGGER update_staff_settings_updated_at BEFORE UPDATE ON staff_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_system_settings_updated_at ON system_settings;
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customer_settings_updated_at ON customer_settings;
CREATE TRIGGER update_customer_settings_updated_at BEFORE UPDATE ON customer_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_data_management_settings_updated_at ON data_management_settings;
CREATE TRIGGER update_data_management_settings_updated_at BEFORE UPDATE ON data_management_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_report_settings_updated_at ON sales_report_settings;
CREATE TRIGGER update_sales_report_settings_updated_at BEFORE UPDATE ON sales_report_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();