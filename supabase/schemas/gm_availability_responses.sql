-- 正規ソース: supabase/schemas/gm_availability_responses.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.gm_availability_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL REFERENCES public.reservations(id),
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  response_status TEXT DEFAULT 'pending'::text,
  available_candidates JSONB,
  confirmed_candidate INTEGER,
  responded_at TIMESTAMPTZ,
  notes TEXT,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  gm_discord_id TEXT,
  gm_name TEXT,
  response_type TEXT,
  selected_candidate_index INTEGER,
  response_datetime TIMESTAMPTZ DEFAULT NOW(),
  response_history JSONB DEFAULT '[]'::jsonb,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  UNIQUE (reservation_id, staff_id)
);

-- Indexes
CREATE INDEX idx_gm_availability_responses_organization_id ON public.gm_availability_responses USING btree (organization_id);
CREATE INDEX idx_gm_responses_discord_id ON public.gm_availability_responses USING btree (gm_discord_id);
CREATE INDEX idx_gm_responses_reservation ON public.gm_availability_responses USING btree (reservation_id);
CREATE INDEX idx_gm_responses_staff ON public.gm_availability_responses USING btree (staff_id);
CREATE INDEX idx_gm_responses_status ON public.gm_availability_responses USING btree (response_status);
CREATE INDEX idx_gm_responses_type ON public.gm_availability_responses USING btree (response_type);
