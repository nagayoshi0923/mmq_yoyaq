-- email_settingsテーブルに人数未達中止メールテンプレートのカラムを追加

DO $$
BEGIN
  -- performance_cancellation_template カラムを追加（人数未達中止）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_settings' 
    AND column_name = 'performance_cancellation_template'
  ) THEN
    ALTER TABLE public.email_settings 
    ADD COLUMN performance_cancellation_template TEXT;
    
    COMMENT ON COLUMN public.email_settings.performance_cancellation_template IS '人数未達による公演中止メールテンプレート';
  END IF;
END $$;
