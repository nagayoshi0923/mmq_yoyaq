-- 正規ソース: supabase/schemas/reservations.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_number TEXT UNIQUE DEFAULT generate_reservation_number(),
  reservation_page_id TEXT,
  title TEXT NOT NULL,
  scenario_id UUID,
  store_id UUID REFERENCES public.stores(id),
  customer_id UUID REFERENCES public.customers(id),
  requested_datetime TIMESTAMPTZ NOT NULL,
  actual_datetime TIMESTAMPTZ,
  duration INTEGER NOT NULL,
  participant_count INTEGER NOT NULL DEFAULT 1,
  participant_names TEXT[] DEFAULT '{}'::text[],
  assigned_staff TEXT[] DEFAULT '{}'::text[],
  gm_staff TEXT,
  base_price INTEGER DEFAULT 0,
  options_price INTEGER DEFAULT 0,
  total_price INTEGER DEFAULT 0,
  discount_amount INTEGER DEFAULT 0,
  final_price INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'pending'::text,
  payment_method TEXT,
  payment_datetime TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  customer_notes TEXT,
  staff_notes TEXT,
  special_requests TEXT,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  external_reservation_id TEXT,
  reservation_source TEXT DEFAULT 'web'::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  schedule_event_id UUID REFERENCES public.schedule_events(id),
  created_by UUID REFERENCES auth.users(id),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  total_amount NUMERIC,
  notes TEXT,
  event_id UUID REFERENCES public.schedule_events(id),
  priority INTEGER DEFAULT 0,
  candidate_datetimes JSONB,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  display_customer_name TEXT,
  unit_price INTEGER,
  coupon_usage_id UUID REFERENCES public.coupon_usages(id),
  scenario_master_id UUID REFERENCES public.scenario_masters(id),
  private_group_id UUID REFERENCES public.private_groups(id),
  reservation_type TEXT DEFAULT 'normal'::text,
  scenario_title TEXT,
  confirmed_by UUID REFERENCES public.staff(id)
);

-- Indexes
CREATE INDEX idx_reservations_confirmed_by ON public.reservations USING btree (confirmed_by);
CREATE INDEX idx_reservations_datetime ON public.reservations USING btree (requested_datetime);
CREATE INDEX idx_reservations_event ON public.reservations USING btree (schedule_event_id);
CREATE INDEX idx_reservations_event_status ON public.reservations USING btree (schedule_event_id, status);
CREATE INDEX idx_reservations_org_status ON public.reservations USING btree (organization_id, status);
CREATE INDEX idx_reservations_organization_id ON public.reservations USING btree (organization_id);
CREATE INDEX idx_reservations_private_group_id ON public.reservations USING btree (private_group_id) WHERE (private_group_id IS NOT NULL);
CREATE INDEX idx_reservations_scenario_master_id ON public.reservations USING btree (scenario_master_id);
CREATE INDEX idx_reservations_schedule_event_id ON public.reservations USING btree (schedule_event_id);
CREATE INDEX idx_reservations_source ON public.reservations USING btree (reservation_source);
CREATE INDEX idx_reservations_status ON public.reservations USING btree (status);
