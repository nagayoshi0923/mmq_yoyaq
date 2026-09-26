-- Server-owned pricing terms captured at private-booking submission.
CREATE TABLE IF NOT EXISTS public.private_booking_pricing_snapshots (
  reservation_id UUID PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  base_fee INTEGER NOT NULL,
  participation_costs JSONB NOT NULL DEFAULT '[]'::JSONB,
  custom_holidays JSONB NOT NULL DEFAULT '[]'::JSONB,
  pricing_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.private_booking_pricing_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_booking_pricing_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.private_booking_pricing_snapshots FROM service_role;
GRANT SELECT ON public.private_booking_pricing_snapshots TO service_role;
COMMENT ON TABLE public.private_booking_pricing_snapshots IS 'Server-only private booking price terms; preserve accepted prices across scenario edits. No client access.';
