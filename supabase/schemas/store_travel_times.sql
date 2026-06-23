-- 正規ソース: supabase/schemas/store_travel_times.sql
-- 最終更新: 2026-06-24
CREATE TABLE public.store_travel_times (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_a_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_b_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT store_travel_times_distinct_stores CHECK (store_a_id <> store_b_id),
  CONSTRAINT store_travel_times_ordered_pair CHECK (store_a_id < store_b_id),
  CONSTRAINT store_travel_times_unique_pair UNIQUE (organization_id, store_a_id, store_b_id)
);

-- Indexes
CREATE INDEX idx_store_travel_times_org ON public.store_travel_times USING btree (organization_id);
CREATE INDEX idx_store_travel_times_store_a ON public.store_travel_times USING btree (store_a_id);
CREATE INDEX idx_store_travel_times_store_b ON public.store_travel_times USING btree (store_b_id);
