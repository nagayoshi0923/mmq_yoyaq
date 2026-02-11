-- =============================================================================
-- セキュリティ修正: レガシー PERMISSIVE ポリシーの削除と修正
-- =============================================================================
-- 問題: 20260209/20260210 で追加した組織境界付きポリシーと、
--        旧ポリシー（org チェックなし）が共存。PERMISSIVE ポリシーは
--        OR で結合されるため、旧ポリシーが新ポリシーを無効化していた。
-- =============================================================================

-- =============================================================================
-- P0-CRITICAL: users テーブルの危険なレガシーポリシーを削除
-- =============================================================================
-- users_all_policy: auth.uid() IS NOT NULL で全操作可能 → 致命的
DROP POLICY IF EXISTS "users_all_policy" ON public.users;

-- users_update_policy: 自分のレコードを無制限更新可能 → 権限昇格の原因
DROP POLICY IF EXISTS "users_update_policy" ON public.users;

-- users_select_policy: 重複（users_select_self_or_admin で代替済み）
DROP POLICY IF EXISTS "users_select_policy" ON public.users;

-- users_insert_policy: 重複（users_insert_self で代替済み）
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;

-- users_delete_policy: 自己削除（users_delete_admin で代替）
DROP POLICY IF EXISTS "users_delete_policy" ON public.users;

-- users_insert_trigger: WITH CHECK true → handle_new_user トリガー用だが危険
-- service_role の INSERT で対応するため削除
DROP POLICY IF EXISTS "users_insert_trigger" ON public.users;

-- users_select_self: 重複（users_select_self_or_admin で代替済み）
DROP POLICY IF EXISTS "users_select_self" ON public.users;

-- service_role はそのまま残す（バックエンド処理で必要）
-- users_service_role_policy は OK

-- =============================================================================
-- P0: staff テーブル — *_strict ポリシーの is_org_admin() にorg境界なし
-- =============================================================================
-- staff_select_strict: is_org_admin() が org フィルタなし → 全org閲覧可能
DROP POLICY IF EXISTS "staff_select_strict" ON public.staff;

-- staff_update_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "staff_update_strict" ON public.staff;

-- staff_delete_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "staff_delete_strict" ON public.staff;

-- staff_insert_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "staff_insert_strict" ON public.staff;

-- 代替: 組織スコープの SELECT ポリシーを作成（既存の staff_update_self_or_admin, staff_delete_admin は OK）
-- staff には SELECT 用の org-scoped ポリシーがないため追加
DROP POLICY IF EXISTS "staff_select_org_scoped" ON public.staff;
CREATE POLICY "staff_select_org_scoped" ON public.staff
  FOR SELECT USING (
    (get_user_organization_id() IS NOT NULL AND organization_id = get_user_organization_id())
    OR user_id = auth.uid()
  );

-- staff INSERT も org-scoped に修正
DROP POLICY IF EXISTS "staff_insert_org_scoped" ON public.staff;
CREATE POLICY "staff_insert_org_scoped" ON public.staff
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_staff_or_admin()
  );

-- staff strict → org-scoped 置換完了

-- =============================================================================
-- P0: stores テーブル — *_strict ポリシーの is_org_admin() にorg境界なし
-- =============================================================================
-- stores_select_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "stores_select_strict" ON public.stores;

-- stores_update_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "stores_update_strict" ON public.stores;

-- stores_delete_strict: is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "stores_delete_strict" ON public.stores;

-- stores_modify_strict (INSERT): is_org_admin() が org フィルタなし
DROP POLICY IF EXISTS "stores_modify_strict" ON public.stores;

-- stores_select_policy は正しく org-scoped なので残す
-- stores_update_admin, stores_delete_admin も org-scoped なので残す

-- stores INSERT 用 org-scoped ポリシーを追加
DROP POLICY IF EXISTS "stores_insert_org_scoped" ON public.stores;
CREATE POLICY "stores_insert_org_scoped" ON public.stores
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id()
    AND is_admin()
  );

-- stores strict → org-scoped 置換完了

-- =============================================================================
-- P1: INSERT ポリシーに組織チェック追加
-- =============================================================================
-- これらのテーブルの INSERT ポリシーは is_admin() のみで org チェックがない

-- scenarios: organization_id カラムあり
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'scenarios' AND column_name = 'organization_id')
  THEN
    DROP POLICY IF EXISTS "scenarios_insert_admin" ON public.scenarios;
    CREATE POLICY "scenarios_insert_admin" ON public.scenarios
      FOR INSERT WITH CHECK (
        is_admin() AND organization_id = get_user_organization_id()
      );
    RAISE NOTICE '✅ scenarios: INSERT ポリシーに org チェック追加';
  END IF;
END $$;

-- performance_kits: organization_id 経由チェック（schedule_events 経由）
-- performance_kits には organization_id がないため、scenario_id 経由
DO $$
BEGIN
  DROP POLICY IF EXISTS "performance_kits_insert_admin" ON public.performance_kits;
  CREATE POLICY "performance_kits_insert_admin" ON public.performance_kits
    FOR INSERT WITH CHECK (
      is_admin() AND scenario_id IN (
        SELECT id FROM scenarios WHERE organization_id = get_user_organization_id()
      )
    );
  RAISE NOTICE '✅ performance_kits: INSERT ポリシーに indirect org チェック追加';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ performance_kits テーブルなし、スキップ';
END $$;

-- settings テーブル群: organization_id カラムあり
DO $$
DECLARE
  v_tbl TEXT;
  v_tables TEXT[] := ARRAY[
    'email_settings', 'global_settings',
    'business_hours_settings', 'reservation_settings'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'organization_id')
    THEN
      EXECUTE format('DROP POLICY IF EXISTS "%s_insert_admin" ON public.%I', v_tbl, v_tbl);
      EXECUTE format('CREATE POLICY "%s_insert_admin" ON public.%I
        FOR INSERT WITH CHECK (
          is_admin() AND organization_id = get_user_organization_id()
        )', v_tbl, v_tbl);
      RAISE NOTICE '✅ %: INSERT ポリシーに org チェック追加', v_tbl;
    ELSE
      RAISE NOTICE '⏭️ %: organization_id カラムなし、スキップ', v_tbl;
    END IF;
  END LOOP;
END $$;

-- store_basic_settings: store_id 経由の indirect チェック
DO $$
BEGIN
  DROP POLICY IF EXISTS "store_basic_settings_insert_admin" ON public.store_basic_settings;
  CREATE POLICY "store_basic_settings_insert_admin" ON public.store_basic_settings
    FOR INSERT WITH CHECK (
      is_admin() AND store_id IN (
        SELECT id FROM stores WHERE organization_id = get_user_organization_id()
      )
    );
  RAISE NOTICE '✅ store_basic_settings: INSERT ポリシーに indirect org チェック追加';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ store_basic_settings テーブルなし、スキップ';
END $$;

-- staff_scenario_assignments: staff_id 経由の indirect チェック
DO $$
BEGIN
  DROP POLICY IF EXISTS "staff_scenario_assignments_insert_admin" ON public.staff_scenario_assignments;
  CREATE POLICY "staff_scenario_assignments_insert_admin" ON public.staff_scenario_assignments
    FOR INSERT WITH CHECK (
      is_admin() AND staff_id IN (
        SELECT id FROM staff WHERE organization_id = get_user_organization_id()
      )
    );
  RAISE NOTICE '✅ staff_scenario_assignments: INSERT ポリシーに indirect org チェック追加';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ staff_scenario_assignments テーブルなし、スキップ';
END $$;

-- miscellaneous_transactions: organization_id カラム確認
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'miscellaneous_transactions' AND column_name = 'organization_id')
  THEN
    DROP POLICY IF EXISTS "miscellaneous_transactions_insert_admin" ON public.miscellaneous_transactions;
    CREATE POLICY "miscellaneous_transactions_insert_admin" ON public.miscellaneous_transactions
      FOR INSERT WITH CHECK (
        is_admin() AND organization_id = get_user_organization_id()
      );
    RAISE NOTICE '✅ miscellaneous_transactions: INSERT ポリシーに org チェック追加';
  ELSE
    RAISE NOTICE '⏭️ miscellaneous_transactions: organization_id カラムなし、スキップ';
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ miscellaneous_transactions テーブルなし、スキップ';
END $$;

-- authors: 共有マスタデータのため license_admin のみに制限
DO $$
BEGIN
  DROP POLICY IF EXISTS "authors_insert_admin" ON public.authors;
  DROP POLICY IF EXISTS "authors_update_admin" ON public.authors;
  DROP POLICY IF EXISTS "authors_delete_admin" ON public.authors;

  CREATE POLICY "authors_insert_admin" ON public.authors
    FOR INSERT WITH CHECK (
      (SELECT role FROM users WHERE id = auth.uid()) = 'license_admin'
    );
  CREATE POLICY "authors_update_admin" ON public.authors
    FOR UPDATE USING (
      (SELECT role FROM users WHERE id = auth.uid()) = 'license_admin'
    );
  CREATE POLICY "authors_delete_admin" ON public.authors
    FOR DELETE USING (
      (SELECT role FROM users WHERE id = auth.uid()) = 'license_admin'
    );
  RAISE NOTICE '✅ authors: license_admin のみに制限';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE '⏭️ authors テーブルなし、スキップ';
END $$;

-- =============================================================================
-- P1: RLS が無効なテーブルに有効化
-- =============================================================================
DO $$
BEGIN
  -- discord_interaction_dedupe: システム内部テーブル
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'discord_interaction_dedupe')
  THEN
    ALTER TABLE public.discord_interaction_dedupe ENABLE ROW LEVEL SECURITY;
    -- service_role のみアクセス可能
    DROP POLICY IF EXISTS "discord_dedupe_service_only" ON public.discord_interaction_dedupe;
    CREATE POLICY "discord_dedupe_service_only" ON public.discord_interaction_dedupe
      FOR ALL USING (auth.role() = 'service_role');
    RAISE NOTICE '✅ discord_interaction_dedupe: RLS 有効化 + service_role only';
  END IF;

  -- salary_settings_history: 組織スコープ
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'salary_settings_history')
  THEN
    ALTER TABLE public.salary_settings_history ENABLE ROW LEVEL SECURITY;
    IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'salary_settings_history' AND column_name = 'organization_id')
    THEN
      DROP POLICY IF EXISTS "salary_settings_history_org_scoped" ON public.salary_settings_history;
      CREATE POLICY "salary_settings_history_org_scoped" ON public.salary_settings_history
        FOR ALL USING (
          is_admin() AND organization_id = get_user_organization_id()
        );
    ELSE
      DROP POLICY IF EXISTS "salary_settings_history_admin_only" ON public.salary_settings_history;
      CREATE POLICY "salary_settings_history_admin_only" ON public.salary_settings_history
        FOR ALL USING (is_admin());
    END IF;
    RAISE NOTICE '✅ salary_settings_history: RLS 有効化';
  END IF;
END $$;

-- =============================================================================
-- 検証: 修正後のポリシー状態
-- =============================================================================
DO $$
DECLARE
  v_count INT;
  v_details TEXT;
BEGIN
  -- 危険なポリシーの残存確認
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'users'
    AND policyname IN ('users_all_policy', 'users_update_policy', 'users_insert_trigger');

  IF v_count > 0 THEN
    RAISE WARNING '❌ users の危険なレガシーポリシーが % 件残存', v_count;
  ELSE
    RAISE NOTICE '✅ users: 危険なレガシーポリシー 0 件';
  END IF;

  -- strict ポリシーの残存確認
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname LIKE '%_strict'
    AND (qual ILIKE '%is_org_admin()%' AND qual NOT ILIKE '%organization_id%');

  IF v_count > 0 THEN
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_details
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE '%_strict'
      AND (qual ILIKE '%is_org_admin()%' AND qual NOT ILIKE '%organization_id%');
    RAISE WARNING '❌ org チェックなしの strict ポリシーが % 件残存: %', v_count, v_details;
  ELSE
    RAISE NOTICE '✅ org チェックなしの strict ポリシー 0 件';
  END IF;

  -- RLS 無効テーブルの確認
  SELECT COUNT(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    AND c.relname NOT IN ('schema_migrations', 'supabase_migrations',
      'spatial_ref_sys', 'geography_columns', 'geometry_columns');

  IF v_count > 0 THEN
    SELECT string_agg(c.relname, ', ') INTO v_details
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      AND c.relname NOT IN ('schema_migrations', 'supabase_migrations',
        'spatial_ref_sys', 'geography_columns', 'geometry_columns');
    RAISE WARNING '❌ RLS 無効テーブル % 件: %', v_count, v_details;
  ELSE
    RAISE NOTICE '✅ 全テーブルで RLS 有効';
  END IF;
END $$;
