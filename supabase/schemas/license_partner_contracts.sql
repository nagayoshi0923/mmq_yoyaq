-- 正規ソース: supabase/schemas/license_partner_contracts.sql
-- 契約先店舗 × 管理作品。license_amount が NULL ならシナリオの他社単価を使う。
CREATE TABLE public.license_partner_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_store_id UUID NOT NULL REFERENCES public.license_partner_stores(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE RESTRICT,
  license_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_partner_contracts_amount_check
    CHECK (license_amount IS NULL OR license_amount >= 0),
  UNIQUE (partner_store_id, scenario_master_id)
);

CREATE INDEX idx_license_partner_contracts_org
  ON public.license_partner_contracts (organization_id);

CREATE INDEX idx_license_partner_contracts_store
  ON public.license_partner_contracts (partner_store_id);

CREATE INDEX idx_license_partner_contracts_scenario
  ON public.license_partner_contracts (scenario_master_id);
