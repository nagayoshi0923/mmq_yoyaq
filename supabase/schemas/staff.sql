-- 正規ソース: supabase/schemas/staff.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  line_name TEXT,
  x_account TEXT,
  role TEXT[] DEFAULT '{}'::text[],
  stores TEXT[] DEFAULT '{}'::text[],
  ng_days TEXT[] DEFAULT '{}'::text[],
  want_to_learn TEXT[] DEFAULT '{}'::text[],
  available_scenarios TEXT[] DEFAULT '{}'::text[],
  notes TEXT,
  phone TEXT,
  email TEXT,
  availability TEXT[] DEFAULT '{}'::text[],
  experience INTEGER DEFAULT 0,
  special_scenarios TEXT[] DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'active'::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  avatar_url TEXT,
  avatar_color TEXT,
  user_id UUID,
  discord_id TEXT,
  discord_channel_id TEXT,
  discord_user_id TEXT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id)
);

-- Indexes
CREATE INDEX idx_staff_discord_channel_id ON public.staff USING btree (discord_channel_id);
CREATE INDEX idx_staff_discord_id ON public.staff USING btree (discord_id);
CREATE INDEX idx_staff_discord_user_id ON public.staff USING btree (discord_user_id);
CREATE INDEX idx_staff_organization_id ON public.staff USING btree (organization_id);
CREATE INDEX idx_staff_status ON public.staff USING btree (status);
CREATE INDEX idx_staff_user_id ON public.staff USING btree (user_id);
