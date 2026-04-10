-- 正規ソース: supabase/schemas/stores.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  email TEXT,
  opening_date DATE,
  manager_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'::text,
  capacity INTEGER NOT NULL DEFAULT 0,
  rooms INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6'::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  fixed_costs JSONB DEFAULT '[]'::jsonb,
  ownership_type TEXT,
  franchise_fee INTEGER DEFAULT 1000,
  is_temporary BOOLEAN DEFAULT FALSE,
  temporary_date DATE,
  temporary_dates JSONB DEFAULT '[]'::jsonb,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  display_order INTEGER DEFAULT 999,
  region TEXT,
  temporary_venue_names JSONB DEFAULT '{}'::jsonb,
  transport_allowance INTEGER,
  kit_group_id UUID REFERENCES public.stores(id),
  venue_cost_per_performance INTEGER DEFAULT 0,
  access_info TEXT
);

-- Indexes
CREATE INDEX idx_stores_display_order ON public.stores USING btree (display_order);
CREATE INDEX idx_stores_kit_group_id ON public.stores USING btree (kit_group_id);
CREATE INDEX idx_stores_organization_id ON public.stores USING btree (organization_id);
CREATE INDEX idx_stores_status ON public.stores USING btree (status);
