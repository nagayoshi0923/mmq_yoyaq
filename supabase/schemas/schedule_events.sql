-- 正規ソース: supabase/schemas/schedule_events.sql
-- 最終更新: 2026-04-10
CREATE TABLE public.schedule_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  venue TEXT NOT NULL,
  scenario TEXT NOT NULL,
  gms TEXT[] DEFAULT '{}'::text[],
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  category TEXT NOT NULL DEFAULT 'open'::text,
  reservation_info TEXT,
  notes TEXT,
  is_cancelled BOOLEAN DEFAULT FALSE,
  scenario_id UUID,
  store_id UUID REFERENCES public.stores(id),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  published BOOLEAN DEFAULT TRUE,
  capacity INTEGER,
  status TEXT DEFAULT 'scheduled'::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  max_participants INTEGER,
  reservation_deadline_hours INTEGER DEFAULT 0,
  is_reservation_enabled BOOLEAN DEFAULT TRUE,
  reservation_notes TEXT,
  current_participants INTEGER DEFAULT 0,
  time_slot TEXT,
  gm_roles JSONB DEFAULT '{}'::jsonb,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  venue_rental_fee INTEGER DEFAULT 12000,
  total_revenue INTEGER DEFAULT 0,
  gm_cost INTEGER DEFAULT 0,
  license_cost INTEGER DEFAULT 0,
  participant_count INTEGER DEFAULT 0,
  reservation_name TEXT,
  is_tentative BOOLEAN DEFAULT FALSE,
  reservation_id UUID REFERENCES public.reservations(id),
  is_reservation_name_overwritten BOOLEAN DEFAULT FALSE,
  is_private_request BOOLEAN DEFAULT FALSE,
  organization_scenario_id UUID REFERENCES public.organization_scenarios(id),
  is_recruitment_extended BOOLEAN DEFAULT FALSE,
  is_private_booking BOOLEAN DEFAULT FALSE,
  is_extended BOOLEAN DEFAULT FALSE,
  extended_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  scenario_master_id UUID REFERENCES public.scenario_masters(id)
);

-- Indexes
CREATE INDEX idx_schedule_events_date ON public.schedule_events USING btree (date);
CREATE INDEX idx_schedule_events_is_cancelled ON public.schedule_events USING btree (is_cancelled) WHERE (is_cancelled = false);
CREATE INDEX idx_schedule_events_is_tentative ON public.schedule_events USING btree (is_tentative) WHERE (is_tentative = true);
CREATE INDEX idx_schedule_events_org_date ON public.schedule_events USING btree (organization_id, date);
CREATE INDEX idx_schedule_events_org_scenario_id ON public.schedule_events USING btree (organization_scenario_id);
CREATE INDEX idx_schedule_events_organization_id ON public.schedule_events USING btree (organization_id);
CREATE INDEX idx_schedule_events_reservation_id ON public.schedule_events USING btree (reservation_id) WHERE (reservation_id IS NOT NULL);
CREATE INDEX idx_schedule_events_scenario_master_id ON public.schedule_events USING btree (scenario_master_id);
CREATE INDEX idx_schedule_events_store_date ON public.schedule_events USING btree (store_id, date);
CREATE UNIQUE INDEX idx_schedule_events_unique_slot ON public.schedule_events USING btree (date, store_id, time_slot, organization_id) WHERE (is_cancelled = false);
CREATE INDEX idx_schedule_events_venue ON public.schedule_events USING btree (venue);
