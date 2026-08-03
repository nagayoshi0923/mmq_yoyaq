-- 正規ソース: supabase/migrations/20260802120000_create_staff_checkins.sql
CREATE TABLE public.staff_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
