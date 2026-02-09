-- RLS hardening: add WITH CHECK to remaining UPDATE policies on org tables
-- Date: 2026-02-09
--
-- Goal:
-- - eliminate UPDATE policies with NULL/empty with_check on tables that have organization_id
-- - keep existing authorization logic (mostly: mirror USING into WITH CHECK)

-- =============================================================================
-- Helper note:
-- - Some policies allow organization_id IS NULL (legacy/shared rows). We DO NOT change that behavior here.
--   We only add WITH CHECK so the same condition is enforced on the post-update row.
-- =============================================================================

-- authors
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='authors') THEN
    ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
    CREATE POLICY "authors_update_admin" ON public.authors
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- business_hours_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='business_hours_settings') THEN
    ALTER TABLE public.business_hours_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "business_hours_settings_update_admin" ON public.business_hours_settings;
    CREATE POLICY "business_hours_settings_update_admin" ON public.business_hours_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- customer_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customer_settings') THEN
    ALTER TABLE public.customer_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "customer_settings_update_own_org" ON public.customer_settings;
    CREATE POLICY "customer_settings_update_own_org" ON public.customer_settings
      FOR UPDATE
      USING (is_admin() AND ((organization_id = get_user_organization_id()) OR (organization_id IS NULL)))
      WITH CHECK (is_admin() AND ((organization_id = get_user_organization_id()) OR (organization_id IS NULL)));
  END IF;
END $$;

-- daily_memos
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='daily_memos') THEN
    ALTER TABLE public.daily_memos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "daily_memos_update_staff_or_admin" ON public.daily_memos;
    CREATE POLICY "daily_memos_update_staff_or_admin" ON public.daily_memos
      FOR UPDATE
      USING (is_staff_or_admin())
      WITH CHECK (is_staff_or_admin());
  END IF;
END $$;

-- data_management_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='data_management_settings') THEN
    ALTER TABLE public.data_management_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "data_management_settings_update_admin" ON public.data_management_settings;
    CREATE POLICY "data_management_settings_update_admin" ON public.data_management_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- email_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_settings') THEN
    ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "email_settings_update_admin" ON public.email_settings;
    CREATE POLICY "email_settings_update_admin" ON public.email_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- external_performance_reports
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='external_performance_reports') THEN
    ALTER TABLE public.external_performance_reports ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS external_reports_org_update ON public.external_performance_reports;
    CREATE POLICY external_reports_org_update ON public.external_performance_reports
      FOR UPDATE
      USING (
        ((organization_id = current_organization_id()) AND (status = 'pending'::text))
        OR is_license_manager()
        OR is_admin()
      )
      WITH CHECK (
        ((organization_id = current_organization_id()) AND (status = 'pending'::text))
        OR is_license_manager()
        OR is_admin()
      );
  END IF;
END $$;

-- global_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='global_settings') THEN
    ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can update own organization settings" ON public.global_settings;
    DROP POLICY IF EXISTS "global_settings_update_admin" ON public.global_settings;

    CREATE POLICY "Users can update own organization settings" ON public.global_settings
      FOR UPDATE
      USING (
        organization_id IN (SELECT staff.organization_id FROM public.staff WHERE staff.user_id = auth.uid())
      )
      WITH CHECK (
        organization_id IN (SELECT staff.organization_id FROM public.staff WHERE staff.user_id = auth.uid())
      );

    CREATE POLICY "global_settings_update_admin" ON public.global_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- kit_transfer_events
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kit_transfer_events') THEN
    ALTER TABLE public.kit_transfer_events ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "kit_transfer_events_update_policy" ON public.kit_transfer_events;
    CREATE POLICY "kit_transfer_events_update_policy" ON public.kit_transfer_events
      FOR UPDATE
      USING (
        organization_id IN (SELECT staff.organization_id FROM public.staff WHERE staff.user_id = auth.uid())
      )
      WITH CHECK (
        organization_id IN (SELECT staff.organization_id FROM public.staff WHERE staff.user_id = auth.uid())
      );
  END IF;
END $$;

-- license_report_history
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='license_report_history') THEN
    ALTER TABLE public.license_report_history ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "license_report_history_update" ON public.license_report_history;
    CREATE POLICY "license_report_history_update" ON public.license_report_history
      FOR UPDATE
      USING (
        organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
      )
      WITH CHECK (
        organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
      );
  END IF;
END $$;

-- manual_external_performances
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='manual_external_performances') THEN
    ALTER TABLE public.manual_external_performances ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users can update their org manual externals" ON public.manual_external_performances;
    CREATE POLICY "Users can update their org manual externals" ON public.manual_external_performances
      FOR UPDATE
      USING (
        organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
      )
      WITH CHECK (
        organization_id IN (SELECT users.organization_id FROM public.users WHERE users.id = auth.uid())
      );
  END IF;
END $$;

-- miscellaneous_transactions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='miscellaneous_transactions') THEN
    ALTER TABLE public.miscellaneous_transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions;
    CREATE POLICY "miscellaneous_transactions_update_admin" ON public.miscellaneous_transactions
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- notification_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notification_settings') THEN
    ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "notification_settings_update_own_org" ON public.notification_settings;
    CREATE POLICY "notification_settings_update_own_org" ON public.notification_settings
      FOR UPDATE
      USING (is_admin() AND ((organization_id = get_user_organization_id()) OR (organization_id IS NULL)))
      WITH CHECK (is_admin() AND ((organization_id = get_user_organization_id()) OR (organization_id IS NULL)));
  END IF;
END $$;

-- organization_scenarios
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_scenarios') THEN
    ALTER TABLE public.organization_scenarios ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_scenarios_update" ON public.organization_scenarios;
    CREATE POLICY "org_scenarios_update" ON public.organization_scenarios
      FOR UPDATE
      USING ((organization_id = get_user_organization_id()) OR is_license_admin())
      WITH CHECK ((organization_id = get_user_organization_id()) OR is_license_admin());
  END IF;
END $$;

-- organization_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organization_settings') THEN
    ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "organization_settings_update" ON public.organization_settings;
    DROP POLICY IF EXISTS "organization_settings_update_own_org" ON public.organization_settings;

    CREATE POLICY "organization_settings_update" ON public.organization_settings
      FOR UPDATE
      USING ((organization_id = get_user_organization_id()) OR is_org_admin())
      WITH CHECK ((organization_id = get_user_organization_id()) OR is_org_admin());

    -- Keep the stricter admin-only path as well (if you rely on it)
    CREATE POLICY "organization_settings_update_own_org" ON public.organization_settings
      FOR UPDATE
      USING (is_admin() AND (organization_id = get_user_organization_id()))
      WITH CHECK (is_admin() AND (organization_id = get_user_organization_id()));
  END IF;
END $$;

-- performance_kits
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='performance_kits') THEN
    ALTER TABLE public.performance_kits ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "performance_kits_update_admin" ON public.performance_kits;
    CREATE POLICY "performance_kits_update_admin" ON public.performance_kits
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- performance_schedule_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='performance_schedule_settings') THEN
    ALTER TABLE public.performance_schedule_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "performance_schedule_settings_update_admin" ON public.performance_schedule_settings;
    CREATE POLICY "performance_schedule_settings_update_admin" ON public.performance_schedule_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- reservation_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reservation_settings') THEN
    ALTER TABLE public.reservation_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "reservation_settings_update_admin" ON public.reservation_settings;
    CREATE POLICY "reservation_settings_update_admin" ON public.reservation_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- sales_report_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales_report_settings') THEN
    ALTER TABLE public.sales_report_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sales_report_settings_update_admin" ON public.sales_report_settings;
    CREATE POLICY "sales_report_settings_update_admin" ON public.sales_report_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- scenario_kit_locations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenario_kit_locations') THEN
    ALTER TABLE public.scenario_kit_locations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "scenario_kit_locations_update_policy" ON public.scenario_kit_locations;
    CREATE POLICY "scenario_kit_locations_update_policy" ON public.scenario_kit_locations
      FOR UPDATE
      USING (
        organization_id IN (
          SELECT staff.organization_id
          FROM public.staff
          WHERE staff.user_id = auth.uid()
            AND (('admin'::text = ANY (staff.role)) OR ('owner'::text = ANY (staff.role)))
        )
      )
      WITH CHECK (
        organization_id IN (
          SELECT staff.organization_id
          FROM public.staff
          WHERE staff.user_id = auth.uid()
            AND (('admin'::text = ANY (staff.role)) OR ('owner'::text = ANY (staff.role)))
        )
      );
  END IF;
END $$;

-- scenario_likes (explicitly forbid UPDATE)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenario_likes') THEN
    ALTER TABLE public.scenario_likes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "scenario_likes_update" ON public.scenario_likes;
    CREATE POLICY "scenario_likes_update" ON public.scenario_likes
      FOR UPDATE
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- scenarios
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenarios') THEN
    ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "scenarios_update_admin" ON public.scenarios;
    CREATE POLICY "scenarios_update_admin" ON public.scenarios
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- staff_scenario_assignments
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_scenario_assignments') THEN
    ALTER TABLE public.staff_scenario_assignments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments;
    CREATE POLICY "staff_scenario_assignments_update_admin" ON public.staff_scenario_assignments
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- staff_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff_settings') THEN
    ALTER TABLE public.staff_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "staff_settings_update_admin" ON public.staff_settings;
    CREATE POLICY "staff_settings_update_admin" ON public.staff_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- store_basic_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='store_basic_settings') THEN
    ALTER TABLE public.store_basic_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "store_basic_settings_update_admin" ON public.store_basic_settings;
    CREATE POLICY "store_basic_settings_update_admin" ON public.store_basic_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- system_settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='system_settings') THEN
    ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "system_settings_update_admin" ON public.system_settings;
    CREATE POLICY "system_settings_update_admin" ON public.system_settings
      FOR UPDATE
      USING (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

