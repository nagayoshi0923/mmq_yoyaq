-- Staging schema compatibility patch (non-destructive)
-- Purpose: add missing columns that the frontend selects, to prevent PostgREST 400s
-- Date: 2026-02-09
--
-- Safety:
-- - Only ADD COLUMN IF NOT EXISTS (no drops, no NOT NULL changes)
-- - Intended for staging environments that are behind the expected schema

DO $$
BEGIN
  -- ----------------------------------------------------------------------------
  -- organizations: frontend expects plan/logo_url etc
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations') THEN
    ALTER TABLE public.organizations
      ADD COLUMN IF NOT EXISTS plan text,
      ADD COLUMN IF NOT EXISTS logo_url text,
      ADD COLUMN IF NOT EXISTS contact_email text,
      ADD COLUMN IF NOT EXISTS contact_name text,
      ADD COLUMN IF NOT EXISTS is_license_manager boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS notes text;
  END IF;

  -- ----------------------------------------------------------------------------
  -- stores: frontend expects region/organization_id/is_temporary/ownership_type
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stores') THEN
    ALTER TABLE public.stores
      ADD COLUMN IF NOT EXISTS region text,
      ADD COLUMN IF NOT EXISTS organization_id uuid,
      ADD COLUMN IF NOT EXISTS is_temporary boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS ownership_type text;
  END IF;

  -- ----------------------------------------------------------------------------
  -- scenarios: schedule_events join selects these columns in some screens
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenarios') THEN
    ALTER TABLE public.scenarios
      ADD COLUMN IF NOT EXISTS slug text,
      ADD COLUMN IF NOT EXISTS key_visual_url text,
      ADD COLUMN IF NOT EXISTS organization_id uuid,
      ADD COLUMN IF NOT EXISTS scenario_type text,
      ADD COLUMN IF NOT EXISTS scenario_master_id uuid;
  END IF;

  -- ----------------------------------------------------------------------------
  -- schedule_events: booking pages select time_slot/current_participants/org id
  -- ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='schedule_events') THEN
    ALTER TABLE public.schedule_events
      ADD COLUMN IF NOT EXISTS organization_id uuid,
      ADD COLUMN IF NOT EXISTS time_slot text,
      ADD COLUMN IF NOT EXISTS current_participants integer DEFAULT 0;
  END IF;
END $$;

-- Optional indexes (safe no-op if column missing)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stores' AND column_name='organization_id') THEN
    CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores(organization_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='schedule_events' AND column_name='organization_id') THEN
    CREATE INDEX IF NOT EXISTS idx_schedule_events_organization_id ON public.schedule_events(organization_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scenarios' AND column_name='scenario_master_id') THEN
    CREATE INDEX IF NOT EXISTS idx_scenarios_scenario_master_id ON public.scenarios(scenario_master_id);
  END IF;
END $$;

