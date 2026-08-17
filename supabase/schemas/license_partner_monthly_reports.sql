-- 正規ソース: supabase/schemas/license_partner_monthly_reports.sql
-- 契約先店舗の月次公演回数。フォーム送信で upsert する。
CREATE TABLE public.license_partner_monthly_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  partner_store_id UUID NOT NULL REFERENCES public.license_partner_stores(id) ON DELETE CASCADE,
  scenario_master_id UUID NOT NULL REFERENCES public.scenario_masters(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  performance_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_via TEXT NOT NULL DEFAULT 'form',
  CONSTRAINT license_partner_monthly_reports_year_check
    CHECK (year BETWEEN 2020 AND 2100),
  CONSTRAINT license_partner_monthly_reports_month_check
    CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT license_partner_monthly_reports_count_check
    CHECK (performance_count >= 0),
  CONSTRAINT license_partner_monthly_reports_via_check
    CHECK (submitted_via IN ('form', 'staff')),
  UNIQUE (partner_store_id, scenario_master_id, year, month)
);

CREATE INDEX idx_license_partner_monthly_reports_org
  ON public.license_partner_monthly_reports (organization_id);

CREATE INDEX idx_license_partner_monthly_reports_period
  ON public.license_partner_monthly_reports (organization_id, year, month);

CREATE INDEX idx_license_partner_monthly_reports_store
  ON public.license_partner_monthly_reports (partner_store_id);
