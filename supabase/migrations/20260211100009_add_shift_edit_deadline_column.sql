-- global_settings に shift_edit_deadline_days_before カラムを追加
-- シフト編集期限（対象月の何日前まで編集可能か）
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS shift_edit_deadline_days_before INTEGER DEFAULT 7;
