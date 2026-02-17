-- schedule_eventsテーブルにis_private_bookingカラムを追加
-- ステージング環境で欠落していたため追加

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'schedule_events' 
    AND column_name = 'is_private_booking'
  ) THEN
    ALTER TABLE public.schedule_events 
    ADD COLUMN is_private_booking BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN public.schedule_events.is_private_booking IS '貸切公演かどうか';
  END IF;
END $$;
