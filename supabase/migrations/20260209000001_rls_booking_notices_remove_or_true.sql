-- =============================================================================
-- 20260209: RLS P0 fix - booking_notices_select_own_org remove OR TRUE
-- =============================================================================
--
-- Problem:
-- - booking_notices_select_own_org policy was created with `... OR TRUE`
--   (effectively allows reading all rows across tenants).
--
-- Fix:
-- - Replace policy with strict, safe rule:
--   - Anyone can read global notices (organization_id IS NULL)
--   - Authenticated staff/admin can read their own org notices
--
-- NOTE:
-- - This may change behavior for anon users: org-specific notices will not be visible
--   unless you implement a safe public access design (e.g., Edge Function with explicit org filter).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'booking_notices'
  ) THEN
    ALTER TABLE public.booking_notices ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "booking_notices_select_own_org" ON public.booking_notices;

    CREATE POLICY "booking_notices_select_own_org" ON public.booking_notices
      FOR SELECT
      USING (
        organization_id IS NULL
        OR organization_id = get_user_organization_id()
        OR is_org_admin()
        OR is_admin()
      );

    RAISE NOTICE '✅ booking_notices_select_own_org updated (OR TRUE removed)';
  ELSE
    RAISE NOTICE 'ℹ️ booking_notices table not found; skipping';
  END IF;
END $$;

