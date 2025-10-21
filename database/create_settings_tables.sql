-- 設定テーブル作成スクリプト

-- 営業時間設定テーブル
CREATE TABLE IF NOT EXISTS business_hours_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  business_start_time TIME NOT NULL DEFAULT '10:00',
  business_end_time TIME NOT NULL DEFAULT '22:00',
  regular_holidays TEXT[] DEFAULT '{}', -- ['monday', 'tuesday', etc.]
  special_open_days JSONB DEFAULT '[]', -- [{ date: '2025-01-01', note: '特別営業' }]
  special_closed_days JSONB DEFAULT '[]', -- [{ date: '2025-12-31', note: '年末休業' }]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 公演スケジュール設定テーブル
CREATE TABLE IF NOT EXISTS performance_schedule_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  performances_per_day INTEGER NOT NULL DEFAULT 2, -- 1日の公演回数
  performance_times JSONB NOT NULL DEFAULT '[{"slot": "afternoon", "start_time": "14:00"}, {"slot": "evening", "start_time": "18:00"}]',
  preparation_time INTEGER NOT NULL DEFAULT 30, -- 公演間の準備時間（分）
  default_duration INTEGER NOT NULL DEFAULT 180, -- デフォルト公演時間（分）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 予約設定テーブル
CREATE TABLE IF NOT EXISTS reservation_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  booking_start_days INTEGER NOT NULL DEFAULT 30, -- 何日前から予約開始
  booking_deadline_days INTEGER NOT NULL DEFAULT 1, -- 何日前まで予約可能
  cancellation_deadline_days INTEGER NOT NULL DEFAULT 3, -- 何日前までキャンセル可能
  min_participants INTEGER NOT NULL DEFAULT 4,
  max_participants INTEGER NOT NULL DEFAULT 8,
  max_simultaneous_bookings INTEGER NOT NULL DEFAULT 3, -- 同時予約可能数
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 料金設定テーブル
CREATE TABLE IF NOT EXISTS pricing_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  default_participation_fee INTEGER NOT NULL DEFAULT 3000,
  time_based_pricing JSONB DEFAULT '[]', -- [{ time_slot: '平日', price: 2500 }]
  early_bird_discount JSONB DEFAULT '{"enabled": false, "days": 7, "discount": 500}',
  group_discount JSONB DEFAULT '{"enabled": false, "min_people": 6, "discount": 500}',
  cancellation_fee JSONB DEFAULT '{"days_before": 3, "fee": 1000}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 売上・レポート設定テーブル
CREATE TABLE IF NOT EXISTS sales_report_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  closing_day INTEGER NOT NULL DEFAULT 25, -- 売上締日（1-31）
  author_report_day INTEGER NOT NULL DEFAULT 28, -- 作者レポート送信日（1-31）
  report_emails TEXT[] DEFAULT '{}', -- レポート送信先メールアドレス
  report_format TEXT NOT NULL DEFAULT 'pdf', -- 'pdf' | 'excel' | 'both'
  auto_send_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 通知設定テーブル
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  new_reservation_email BOOLEAN NOT NULL DEFAULT true,
  new_reservation_discord BOOLEAN NOT NULL DEFAULT false,
  cancellation_email BOOLEAN NOT NULL DEFAULT true,
  cancellation_discord BOOLEAN NOT NULL DEFAULT false,
  shift_reminder_days INTEGER NOT NULL DEFAULT 7,
  performance_reminder_days INTEGER NOT NULL DEFAULT 1,
  sales_report_notification BOOLEAN NOT NULL DEFAULT true,
  discord_webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- スタッフ設定テーブル
CREATE TABLE IF NOT EXISTS staff_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  default_main_gm_reward INTEGER NOT NULL DEFAULT 2000,
  default_sub_gm_reward INTEGER NOT NULL DEFAULT 1500,
  shift_deadline_days INTEGER NOT NULL DEFAULT 14, -- シフト提出期限（公演日の何日前）
  staff_rank_enabled BOOLEAN NOT NULL DEFAULT false,
  training_period_days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- システム設定テーブル
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  language TEXT NOT NULL DEFAULT 'ja',
  currency TEXT NOT NULL DEFAULT 'JPY',
  date_format TEXT NOT NULL DEFAULT 'YYYY/MM/DD',
  decimal_places INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- メール設定テーブル
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL,
  reservation_confirmation_template TEXT,
  cancellation_template TEXT,
  reminder_template TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- 顧客管理設定テーブル
CREATE TABLE IF NOT EXISTS customer_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  member_rank_enabled BOOLEAN NOT NULL DEFAULT false,
  points_enabled BOOLEAN NOT NULL DEFAULT false,
  repeat_customer_discount JSONB DEFAULT '{"enabled": false, "visits": 5, "discount": 500}',
  birthday_benefit_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- データ管理設定テーブル
CREATE TABLE IF NOT EXISTS data_management_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  backup_frequency TEXT NOT NULL DEFAULT 'daily', -- 'daily' | 'weekly' | 'monthly'
  data_retention_years INTEGER NOT NULL DEFAULT 5,
  auto_archive_enabled BOOLEAN NOT NULL DEFAULT true,
  export_format TEXT NOT NULL DEFAULT 'excel', -- 'excel' | 'csv' | 'json'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_business_hours_store ON business_hours_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_performance_schedule_store ON performance_schedule_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_reservation_settings_store ON reservation_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_pricing_settings_store ON pricing_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_report_settings_store ON sales_report_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_store ON notification_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_staff_settings_store ON staff_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_store ON system_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_email_settings_store ON email_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_settings_store ON customer_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_data_settings_store ON data_management_settings(store_id);

-- RLS有効化
ALTER TABLE business_hours_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_management_settings ENABLE ROW LEVEL SECURITY;

-- ポリシー作成（管理者とスタッフのみアクセス可能）
CREATE POLICY "Admin and staff can view settings"
  ON business_hours_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'staff')
    )
  );

-- 他のテーブルにも同様のポリシーを適用
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'business_hours_settings',
      'performance_schedule_settings',
      'reservation_settings',
      'pricing_settings',
      'sales_report_settings',
      'notification_settings',
      'staff_settings',
      'system_settings',
      'email_settings',
      'customer_settings',
      'data_management_settings'
    ])
  LOOP
    EXECUTE format('
      CREATE POLICY "Admin and staff can insert %I"
        ON %I FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN (''admin'', ''staff'')
          )
        );
      
      CREATE POLICY "Admin and staff can update %I"
        ON %I FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN (''admin'', ''staff'')
          )
        );
      
      CREATE POLICY "Admin and staff can delete %I"
        ON %I FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN (''admin'', ''staff'')
          )
        );
    ', tbl, tbl, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

