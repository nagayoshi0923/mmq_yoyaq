-- 正規ソース: supabase/schemas/business_hours_settings.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.business_hours_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID UNIQUE REFERENCES public.stores(id),
  opening_hours JSONB,
  holidays TEXT[],
  time_restrictions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  special_open_days JSONB DEFAULT '[]'::jsonb,
  special_closed_days JSONB DEFAULT '[]'::jsonb,
  organization_id UUID REFERENCES public.organizations(id)
);
