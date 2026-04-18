-- スケジュールの募集停止スロットをDBで管理する
-- 従来は localStorage 保存だったため、ブラウザキャッシュ削除で消えていた

CREATE TABLE IF NOT EXISTS public.schedule_blocked_slots (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid      NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  store_id      text        NOT NULL,  -- stores.id (uuid) または臨時会場キー
  time_slot     text        NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  created_at    timestamptz DEFAULT now() NOT NULL,
  UNIQUE (organization_id, date, store_id, time_slot)
);

ALTER TABLE public.schedule_blocked_slots ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザー（スタッフ・管理者）は全操作可能
CREATE POLICY "authenticated full access" ON public.schedule_blocked_slots
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
