-- RLS: allow public SELECT for active organizations (booking site needs org lookup by slug)
-- Date: 2026-02-09
--
-- Rationale:
-- - Public booking routes need to resolve organization by slug even when auth.uid() is NULL.
-- - Without this, the frontend cannot obtain orgId and ends up showing 0 events/scenarios.
-- - organizations is a non-tenant table (exception); we allow reading active org metadata.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
  ) THEN
    ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

    -- Replace overly strict policy that required a users row.
    DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
    DROP POLICY IF EXISTS organizations_admin_policy ON public.organizations;

    -- Public read: active organizations only (includes anon/authenticated).
    CREATE POLICY organizations_select_active_public ON public.organizations
      FOR SELECT
      USING (is_active = true);

    -- Admin full access (kept compatible with existing role model)
    CREATE POLICY organizations_admin_policy ON public.organizations
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'::app_role
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'::app_role
        )
      );
  END IF;
END $$;

