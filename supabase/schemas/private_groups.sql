-- 正規ソース: supabase/schemas/private_groups.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.private_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  scenario_id UUID,
  organizer_id UUID NOT NULL,
  name TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'gathering'::text,
  reservation_id UUID,
  target_participant_count INTEGER,
  preferred_store_ids UUID[] DEFAULT '{}'::uuid[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_price INTEGER,
  per_person_price INTEGER,
  character_assignment_method TEXT,
  character_assignments JSONB
);

-- Indexes
CREATE INDEX idx_private_groups_invite_code ON public.private_groups USING btree (invite_code);
CREATE INDEX idx_private_groups_organization_id ON public.private_groups USING btree (organization_id);
CREATE INDEX idx_private_groups_organizer_id ON public.private_groups USING btree (organizer_id);
CREATE INDEX idx_private_groups_scenario_id ON public.private_groups USING btree (scenario_id);
CREATE INDEX idx_private_groups_status ON public.private_groups USING btree (status);
