-- email_settingsテーブルに公演中止（管理者による）メールテンプレートのカラムを追加

DO $$
BEGIN
  -- event_cancellation_template カラムを追加（管理者による公演中止）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_settings' 
    AND column_name = 'event_cancellation_template'
  ) THEN
    ALTER TABLE public.email_settings 
    ADD COLUMN event_cancellation_template TEXT;
    
    COMMENT ON COLUMN public.email_settings.event_cancellation_template IS '管理者による公演中止メールテンプレート';
  END IF;
END $$;
