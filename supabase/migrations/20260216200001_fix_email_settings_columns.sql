-- email_settings テーブルに会社情報カラムを追加（不足している場合）
ALTER TABLE public.email_settings
ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT 'クイーンズワルツ',
ADD COLUMN IF NOT EXISTS company_phone TEXT,
ADD COLUMN IF NOT EXISTS company_email TEXT,
ADD COLUMN IF NOT EXISTS company_address TEXT;

-- 新しいメールテンプレートカラムを追加
ALTER TABLE public.email_settings
ADD COLUMN IF NOT EXISTS booking_change_template TEXT,
ADD COLUMN IF NOT EXISTS private_request_template TEXT,
ADD COLUMN IF NOT EXISTS private_confirm_template TEXT,
ADD COLUMN IF NOT EXISTS private_cancellation_template TEXT,
ADD COLUMN IF NOT EXISTS private_rejection_template TEXT,
ADD COLUMN IF NOT EXISTS waitlist_notify_template TEXT;

-- reminder_schedule の型を JSONB に変更（TEXT の場合）
-- 注意: ALTER COLUMN TYPE は IF NOT EXISTS をサポートしないため、DO ブロックで確認
DO $$
BEGIN
  -- reminder_schedule が TEXT 型の場合のみ JSONB に変換
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_settings' 
    AND column_name = 'reminder_schedule' 
    AND data_type = 'text'
  ) THEN
    -- 既存のデータがある場合は JSON として解釈できるかテスト
    -- 空文字列やNULLはそのまま NULL として扱う
    ALTER TABLE public.email_settings 
    ALTER COLUMN reminder_schedule TYPE JSONB 
    USING CASE 
      WHEN reminder_schedule IS NULL OR reminder_schedule = '' THEN NULL
      ELSE reminder_schedule::JSONB 
    END;
    
    RAISE NOTICE 'reminder_schedule を TEXT から JSONB に変換しました';
  ELSE
    RAISE NOTICE 'reminder_schedule は既に JSONB 型です';
  END IF;
END $$;

COMMENT ON COLUMN public.email_settings.company_name IS '会社名';
COMMENT ON COLUMN public.email_settings.company_phone IS '会社電話番号';
COMMENT ON COLUMN public.email_settings.company_email IS '会社メールアドレス';
COMMENT ON COLUMN public.email_settings.company_address IS '会社住所';
COMMENT ON COLUMN public.email_settings.booking_change_template IS '予約変更確認メールテンプレート';
COMMENT ON COLUMN public.email_settings.private_request_template IS '貸切リクエスト受付メールテンプレート';
COMMENT ON COLUMN public.email_settings.private_confirm_template IS '貸切予約確定メールテンプレート';
COMMENT ON COLUMN public.email_settings.private_cancellation_template IS '貸切キャンセル確認メールテンプレート';
COMMENT ON COLUMN public.email_settings.private_rejection_template IS '貸切リクエスト却下メールテンプレート';
COMMENT ON COLUMN public.email_settings.waitlist_notify_template IS 'キャンセル待ち通知メールテンプレート';
