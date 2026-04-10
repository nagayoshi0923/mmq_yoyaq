-- 正規ソース: supabase/schemas/global_settings.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.global_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_submission_start_day INTEGER DEFAULT 1,
  shift_submission_end_day INTEGER DEFAULT 15,
  shift_submission_target_months_ahead INTEGER DEFAULT 1,
  system_name TEXT DEFAULT 'MMQ 予約管理システム'::text,
  maintenance_mode BOOLEAN DEFAULT FALSE,
  maintenance_message TEXT,
  enable_email_notifications BOOLEAN DEFAULT TRUE,
  enable_discord_notifications BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id),
  gm_base_pay INTEGER DEFAULT 2000,
  gm_hourly_rate INTEGER DEFAULT 1300,
  gm_test_base_pay INTEGER DEFAULT 0,
  gm_test_hourly_rate INTEGER DEFAULT 1300,
  reception_fixed_pay INTEGER DEFAULT 2000,
  use_hourly_table BOOLEAN DEFAULT FALSE,
  hourly_rates JSONB DEFAULT '[{"hours": 1, "amount": 3300}, {"hours": 1.5, "amount": 3950}, {"hours": 2, "amount": 4600}, {"hours": 2.5, "amount": 5250}, {"hours": 3, "amount": 5900}, {"hours": 3.5, "amount": 6550}, {"hours": 4, "amount": 7200}]'::jsonb,
  gm_test_hourly_rates JSONB DEFAULT '[{"hours": 1, "amount": 1300}, {"hours": 1.5, "amount": 1950}, {"hours": 2, "amount": 2600}, {"hours": 2.5, "amount": 3250}, {"hours": 3, "amount": 3900}, {"hours": 3.5, "amount": 4550}, {"hours": 4, "amount": 5200}]'::jsonb,
  shift_edit_deadline_days_before INTEGER DEFAULT 7,
  pre_reading_notice_message TEXT,
  system_msg_group_created_title TEXT DEFAULT '貸切リクエストグループを作成しました'::text,
  system_msg_group_created_body TEXT DEFAULT '招待リンクを共有して、参加メンバーを招待してください。'::text,
  system_msg_group_created_note TEXT DEFAULT '※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'::text,
  system_msg_booking_requested_title TEXT DEFAULT '貸切リクエストを送信しました'::text,
  system_msg_booking_requested_body TEXT DEFAULT '店舗より日程確定のご連絡をいたしますので、しばらくお待ちください。'::text,
  system_msg_schedule_confirmed_title TEXT DEFAULT '日程が確定いたしました'::text,
  system_msg_schedule_confirmed_body TEXT DEFAULT 'ご予約ありがとうございます。当日のご来店をお待ちしております。'::text,
  system_msg_booking_rejected_title TEXT,
  system_msg_booking_rejected_body TEXT,
  system_msg_booking_cancelled_title TEXT,
  system_msg_booking_cancelled_body TEXT
);

-- Indexes
CREATE INDEX idx_global_settings_organization_id ON public.global_settings USING btree (organization_id);
