-- schedule_eventsテーブルに募集延長フラグを追加

DO $$
BEGIN
  -- is_extended カラムを追加（募集期間延長中フラグ）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'schedule_events' 
    AND column_name = 'is_extended'
  ) THEN
    ALTER TABLE public.schedule_events 
    ADD COLUMN is_extended BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public.schedule_events.is_extended IS '募集期間延長中フラグ（前日判定で過半数達成・満席未達の場合true）';
  END IF;
  
  -- extended_at カラムを追加（延長判定日時）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'schedule_events' 
    AND column_name = 'extended_at'
  ) THEN
    ALTER TABLE public.schedule_events 
    ADD COLUMN extended_at TIMESTAMPTZ;
    
    COMMENT ON COLUMN public.schedule_events.extended_at IS '募集期間延長判定日時';
  END IF;
END $$;
