-- schedule_event_history テーブルに不足カラムを追加
-- テーブルが存在する場合のみ実行（ブートストラップで作成済みの場合はスキップされるカラムあり）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schedule_event_history') THEN
    ALTER TABLE public.schedule_event_history ADD COLUMN IF NOT EXISTS event_date DATE;
    ALTER TABLE public.schedule_event_history ADD COLUMN IF NOT EXISTS store_id UUID;
    ALTER TABLE public.schedule_event_history ADD COLUMN IF NOT EXISTS time_slot TEXT;
    ALTER TABLE public.schedule_event_history ADD COLUMN IF NOT EXISTS deleted_event_scenario TEXT;

    CREATE INDEX IF NOT EXISTS idx_schedule_event_history_event_id ON public.schedule_event_history(schedule_event_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_event_history_org_id ON public.schedule_event_history(organization_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_event_history_created_at ON public.schedule_event_history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_schedule_event_history_changed_by ON public.schedule_event_history(changed_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_event_history_cell ON public.schedule_event_history(organization_id, event_date, store_id, time_slot);

    COMMENT ON COLUMN public.schedule_event_history.event_date IS '公演日（セル特定用）';
    COMMENT ON COLUMN public.schedule_event_history.store_id IS '店舗ID（セル特定用）';
    COMMENT ON COLUMN public.schedule_event_history.time_slot IS '時間帯（朝/昼/夜）（セル特定用）';
    COMMENT ON COLUMN public.schedule_event_history.deleted_event_scenario IS '削除された公演のシナリオ名';
  END IF;
END $$;
