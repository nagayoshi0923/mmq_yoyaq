-- email_settingsテーブルに公演募集延長メールテンプレートのカラムを追加

DO $$
BEGIN
  -- performance_extension_template カラムを追加（公演募集延長通知）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_settings' 
    AND column_name = 'performance_extension_template'
  ) THEN
    ALTER TABLE public.email_settings 
    ADD COLUMN performance_extension_template TEXT;
    
    COMMENT ON COLUMN public.email_settings.performance_extension_template IS '公演募集延長通知メールテンプレート（4時間前まで延長）';
  END IF;
END $$;
