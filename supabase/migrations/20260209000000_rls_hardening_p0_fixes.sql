-- =============================================================================
-- 20260209: RLS hardening (P0) - remove OR TRUE + unify strict org boundary
-- =============================================================================
--
-- Why:
-- - Audit found RLS policy containing `OR true` (equivalent to disabling RLS).
-- - Several core tables had multiple permissive policies with weak conditions
--   (e.g. `auth.uid() IS NOT NULL` or `current_organization_id() IS NULL`),
--   risking cross-tenant reads/writes.
--
-- Goal:
-- - Drop all existing policies on target tables and recreate strict policies:
--   - staff/admin: self org only (or org admin override)
--   - anon/customer: public-only where intended
-- - Ensure UPDATE policies have explicit WITH CHECK.
--
-- Notes:
-- - This migration is idempotent: it drops current policies by querying pg_policies.
-- - Uses existing helper functions: get_user_organization_id(), is_org_admin(),
--   is_staff_or_admin(), is_admin(), is_license_admin() if present.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: drop all policies for a table
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  -- gm_availability_responses
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='gm_availability_responses'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.gm_availability_responses', r.policyname);
  END LOOP;

  -- pricing_settings
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='pricing_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pricing_settings', r.policyname);
  END LOOP;

  -- stores
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='stores'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stores', r.policyname);
  END LOOP;

  -- staff
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='staff'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.staff', r.policyname);
  END LOOP;

  -- schedule_events
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='schedule_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.schedule_events', r.policyname);
  END LOOP;

  -- reservations
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reservations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reservations', r.policyname);
  END LOOP;

  -- customers
  FOR r IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='customers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customers', r.policyname);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 1) gm_availability_responses (P0: remove OR TRUE)
-- -----------------------------------------------------------------------------
ALTER TABLE public.gm_availability_responses ENABLE ROW LEVEL SECURITY;

-- SELECT: staff/admin in same org (or org admin)
CREATE POLICY gm_availability_responses_select_strict ON public.gm_availability_responses
  FOR SELECT
  USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
  );

-- INSERT: self staff only (or org admin), org must match, reservation must match org
CREATE POLICY gm_availability_responses_insert_strict ON public.gm_availability_responses
  FOR INSERT
  WITH CHECK (
    (
      is_org_admin()
      OR (
        staff_id IN (
          SELECT s.id
          FROM public.staff s
          WHERE s.user_id = auth.uid()
            AND s.organization_id = gm_availability_responses.organization_id
        )
      )
    )
    AND gm_availability_responses.organization_id = (
      SELECT r.organization_id FROM public.reservations r WHERE r.id = gm_availability_responses.reservation_id
    )
  );

-- UPDATE: self staff only (or org admin), cannot escape org
CREATE POLICY gm_availability_responses_update_strict ON public.gm_availability_responses
  FOR UPDATE
  USING (
    is_org_admin()
    OR (
      staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid())
      AND organization_id = get_user_organization_id()
    )
  )
  WITH CHECK (
    is_org_admin()
    OR (
      staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid())
      AND organization_id = get_user_organization_id()
    )
  );

-- DELETE: org admin only
CREATE POLICY gm_availability_responses_delete_strict ON public.gm_availability_responses
  FOR DELETE
  USING (is_org_admin());

-- -----------------------------------------------------------------------------
-- 2) pricing_settings (remove NULL-org and NULL-current-org escape hatches)
-- -----------------------------------------------------------------------------
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_settings_select_strict ON public.pricing_settings
  FOR SELECT
  USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR is_admin()
  );

CREATE POLICY pricing_settings_insert_strict ON public.pricing_settings
  FOR INSERT
  WITH CHECK (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR is_admin()
  );

CREATE POLICY pricing_settings_update_strict ON public.pricing_settings
  FOR UPDATE
  USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR is_admin()
  )
  WITH CHECK (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR is_admin()
  );

CREATE POLICY pricing_settings_delete_strict ON public.pricing_settings
  FOR DELETE
  USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR is_admin()
  );

-- -----------------------------------------------------------------------------
-- 3) stores (public read active only; staff/admin read own org)
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY stores_select_strict ON public.stores
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        status = 'active'
    END
  );

CREATE POLICY stores_modify_strict ON public.stores
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin());

CREATE POLICY stores_update_strict ON public.stores
  FOR UPDATE
  USING (organization_id = get_user_organization_id() OR is_org_admin())
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin());

CREATE POLICY stores_delete_strict ON public.stores
  FOR DELETE
  USING (organization_id = get_user_organization_id() OR is_org_admin());

-- -----------------------------------------------------------------------------
-- 4) staff (no cross-org public read)
-- -----------------------------------------------------------------------------
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_select_strict ON public.staff
  FOR SELECT
  USING (
    is_org_admin()
    OR (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR (user_id = auth.uid())
  );

CREATE POLICY staff_insert_strict ON public.staff
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin());

CREATE POLICY staff_update_strict ON public.staff
  FOR UPDATE
  USING (organization_id = get_user_organization_id() OR is_org_admin() OR user_id = auth.uid())
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin() OR user_id = auth.uid());

CREATE POLICY staff_delete_strict ON public.staff
  FOR DELETE
  USING (organization_id = get_user_organization_id() OR is_org_admin());

-- -----------------------------------------------------------------------------
-- 5) schedule_events (public read non-cancelled; staff/admin own org modify)
-- -----------------------------------------------------------------------------
ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_events_select_strict ON public.schedule_events
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        is_cancelled = false
    END
  );

CREATE POLICY schedule_events_insert_strict ON public.schedule_events
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin());

CREATE POLICY schedule_events_update_strict ON public.schedule_events
  FOR UPDATE
  USING (organization_id = get_user_organization_id() OR is_org_admin())
  WITH CHECK (organization_id = get_user_organization_id() OR is_org_admin());

CREATE POLICY schedule_events_delete_strict ON public.schedule_events
  FOR DELETE
  USING (organization_id = get_user_organization_id() OR is_org_admin());

-- -----------------------------------------------------------------------------
-- 6) reservations (customer own rows; staff/admin own org)
-- -----------------------------------------------------------------------------
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY reservations_select_strict ON public.reservations
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        EXISTS (
          SELECT 1
          FROM public.customers c
          WHERE c.id = reservations.customer_id
            AND c.user_id = auth.uid()
        )
    END
  );

CREATE POLICY reservations_insert_strict ON public.reservations
  FOR INSERT
  WITH CHECK (
    -- enforce org matches schedule_event org (prevents org injection)
    reservations.organization_id = (SELECT se.organization_id FROM public.schedule_events se WHERE se.id = reservations.schedule_event_id)
    AND (
      -- staff/admin: own org
      (get_user_organization_id() IS NOT NULL AND reservations.organization_id = get_user_organization_id())
      OR is_org_admin()
      OR
      -- customer: owns customer_id
      EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = reservations.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY reservations_update_strict ON public.reservations
  FOR UPDATE
  USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR is_org_admin()
    OR EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = reservations.customer_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- keep org consistent with schedule_event
    reservations.organization_id = (SELECT se.organization_id FROM public.schedule_events se WHERE se.id = reservations.schedule_event_id)
    AND (
      (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
      OR is_org_admin()
      OR EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = reservations.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY reservations_delete_strict ON public.reservations
  FOR DELETE
  USING (organization_id = get_user_organization_id() OR is_org_admin());

-- -----------------------------------------------------------------------------
-- 7) customers (customer self; staff/admin own org)
-- -----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select_strict ON public.customers
  FOR SELECT
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        user_id IS NOT NULL AND user_id = auth.uid()
    END
  );

CREATE POLICY customers_insert_strict ON public.customers
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        user_id IS NOT NULL AND user_id = auth.uid()
    END
  );

CREATE POLICY customers_update_strict ON public.customers
  FOR UPDATE
  USING (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        user_id IS NOT NULL AND user_id = auth.uid()
    END
  )
  WITH CHECK (
    CASE
      WHEN get_user_organization_id() IS NOT NULL THEN
        organization_id = get_user_organization_id() OR is_org_admin()
      ELSE
        user_id IS NOT NULL AND user_id = auth.uid()
    END
  );

CREATE POLICY customers_delete_strict ON public.customers
  FOR DELETE
  USING (organization_id = get_user_organization_id() OR is_org_admin());

-- -----------------------------------------------------------------------------
-- End
-- -----------------------------------------------------------------------------
