-- 正規ソース: supabase/schemas/store_recruitment_pauses.sql
CREATE TABLE public.store_recruitment_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  pause_type text NOT NULL CHECK (pause_type IN ('performance', 'private')),
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

CREATE INDEX idx_store_recruitment_pauses_lookup
  ON public.store_recruitment_pauses (organization_id, store_id, pause_type);

ALTER TABLE public.store_recruitment_pauses ENABLE ROW LEVEL SECURITY;
