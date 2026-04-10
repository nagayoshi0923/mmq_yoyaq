-- 正規ソース: supabase/schemas/private_group_candidate_dates.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.private_group_candidate_dates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.private_groups(id),
  date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  order_num INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'active'::text
);

-- Indexes
CREATE INDEX idx_private_group_candidate_dates_group_id ON public.private_group_candidate_dates USING btree (group_id);
