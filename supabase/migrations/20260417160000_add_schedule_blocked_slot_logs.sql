-- 募集中止・再開の操作履歴を記録するテーブル

CREATE TABLE IF NOT EXISTS public.schedule_blocked_slot_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  store_id        text        NOT NULL,
  time_slot       text        NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  action          text        NOT NULL CHECK (action IN ('blocked', 'unblocked')),
  performed_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.schedule_blocked_slot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access" ON public.schedule_blocked_slot_logs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
