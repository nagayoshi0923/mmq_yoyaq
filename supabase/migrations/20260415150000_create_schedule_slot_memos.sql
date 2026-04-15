-- スケジュールのスロットメモテーブル
-- 空スロットに入力するメモを全スタッフ間で共有するために DB に保存する

CREATE TABLE IF NOT EXISTS public.schedule_slot_memos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date        date NOT NULL,
  store_id    uuid NOT NULL,
  time_slot   text NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  memo        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date, store_id, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_schedule_slot_memos_org_date
  ON public.schedule_slot_memos (organization_id, date);

ALTER TABLE public.schedule_slot_memos ENABLE ROW LEVEL SECURITY;

-- スタッフ・管理者のみ読み書き可能
CREATE POLICY "slot_memos_select" ON public.schedule_slot_memos
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "slot_memos_insert" ON public.schedule_slot_memos
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "slot_memos_update" ON public.schedule_slot_memos
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "slot_memos_delete" ON public.schedule_slot_memos
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM public.staff WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_slot_memos TO authenticated;
