-- =============================================================================
-- RLSポリシー修正: 組織フィルタ強化
-- =============================================================================
-- テーブルが存在する場合のみポリシーを適用（新規セットアップ時にスキップ可能）

DO $$
BEGIN
  -- 1. stores
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stores') THEN
    DROP POLICY IF EXISTS "stores_select_all" ON public.stores;
    DROP POLICY IF EXISTS "stores_select_org_or_anon" ON public.stores;
    CREATE POLICY "stores_select_org_or_anon" ON public.stores FOR SELECT
      USING (get_user_organization_id() IS NULL OR organization_id = get_user_organization_id());
  END IF;

  -- 2. scenarios（is_shared がある場合のみ使用、なければ organization_id のみ）
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scenarios') THEN
    DROP POLICY IF EXISTS "scenarios_select_all" ON public.scenarios;
    DROP POLICY IF EXISTS "scenarios_select_org_or_anon" ON public.scenarios;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scenarios' AND column_name='is_shared') THEN
      CREATE POLICY "scenarios_select_org_or_anon" ON public.scenarios FOR SELECT
        USING (get_user_organization_id() IS NULL OR organization_id = get_user_organization_id() OR is_shared = true);
    ELSE
      CREATE POLICY "scenarios_select_org_or_anon" ON public.scenarios FOR SELECT
        USING (get_user_organization_id() IS NULL OR organization_id = get_user_organization_id());
    END IF;
  END IF;

  -- 3. schedule_events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='schedule_events') THEN
    DROP POLICY IF EXISTS "schedule_events_select_all" ON public.schedule_events;
    DROP POLICY IF EXISTS "schedule_events_select_org_or_anon" ON public.schedule_events;
    CREATE POLICY "schedule_events_select_org_or_anon" ON public.schedule_events FOR SELECT
      USING (get_user_organization_id() IS NULL OR organization_id = get_user_organization_id());
  END IF;

  -- 4. staff
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='staff') THEN
    DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
    DROP POLICY IF EXISTS "staff_select_org_or_anon" ON public.staff;
    CREATE POLICY "staff_select_org_or_anon" ON public.staff FOR SELECT
      USING (get_user_organization_id() IS NULL OR organization_id = get_user_organization_id());
  END IF;
END $$;

