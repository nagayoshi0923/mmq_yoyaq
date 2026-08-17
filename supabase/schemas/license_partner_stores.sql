-- 正規ソース: supabase/schemas/license_partner_stores.sql
-- 契約先店舗（アナーキー様など）。QW自店舗（stores）とは別物。
CREATE TABLE public.license_partner_stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discord_channel_id TEXT,
  report_token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_partner_stores_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT license_partner_stores_token_not_blank CHECK (length(report_token) >= 32)
);

CREATE INDEX idx_license_partner_stores_org
  ON public.license_partner_stores (organization_id);

CREATE INDEX idx_license_partner_stores_discord
  ON public.license_partner_stores (discord_channel_id)
  WHERE discord_channel_id IS NOT NULL;
