-- 正規ソース: supabase/schemas/scenario_masters.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.scenario_masters (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  author_id UUID REFERENCES public.authors(id),
  key_visual_url TEXT,
  description TEXT,
  player_count_min INTEGER NOT NULL DEFAULT 4,
  player_count_max INTEGER NOT NULL DEFAULT 6,
  official_duration INTEGER NOT NULL DEFAULT 180,
  genre TEXT[] DEFAULT '{}'::text[],
  difficulty TEXT,
  synopsis TEXT,
  caution TEXT,
  required_items TEXT[],
  master_status TEXT NOT NULL DEFAULT 'draft'::text,
  submitted_by_organization_id UUID REFERENCES public.organizations(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  author_email TEXT,
  has_pre_reading BOOLEAN DEFAULT FALSE,
  release_date DATE,
  official_site_url TEXT,
  gallery_images TEXT[] DEFAULT '{}'::text[],
  weekend_duration INTEGER,
  report_display_name TEXT
);

-- Indexes
CREATE INDEX idx_scenario_masters_author ON public.scenario_masters USING btree (author);
CREATE INDEX idx_scenario_masters_status ON public.scenario_masters USING btree (master_status);
CREATE INDEX idx_scenario_masters_submitted_by ON public.scenario_masters USING btree (submitted_by_organization_id);
CREATE INDEX idx_scenario_masters_title ON public.scenario_masters USING btree (title);
