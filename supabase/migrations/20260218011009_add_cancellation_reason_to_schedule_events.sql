-- schedule_eventsテーブルに中止理由カラムを追加

DO $$
BEGIN
  -- cancellation_reason カラムを追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'schedule_events' 
    AND column_name = 'cancellation_reason'
  ) THEN
    ALTER TABLE public.schedule_events 
    ADD COLUMN cancellation_reason TEXT;
    
    COMMENT ON COLUMN public.schedule_events.cancellation_reason IS '公演中止理由（手動中止時に設定）';
  END IF;
  
  -- cancelled_at カラムを追加（中止日時）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'schedule_events' 
    AND column_name = 'cancelled_at'
  ) THEN
    ALTER TABLE public.schedule_events 
    ADD COLUMN cancelled_at TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.schedule_events.cancelled_at IS '公演中止日時';
  END IF;
END $$;
