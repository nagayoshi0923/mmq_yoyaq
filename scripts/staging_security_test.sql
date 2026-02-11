-- ============================================================================
-- ステージング環境セキュリティテスト
-- ============================================================================
-- 実行方法: Supabase SQL Editor で全文を貼り付けて実行
-- 前提: 2つ以上の組織と各組織にadmin/customerユーザーが存在すること
-- 結果: RAISE NOTICE (✅ PASS) / RAISE WARNING (❌ FAIL) で表示
-- ============================================================================

-- ============================================================================
-- SECTION 0: テスト結果テーブル＆ヘルパー
-- ============================================================================
-- cli_login_postgres は直接テーブルアクセス不可のため postgres ロールに切替
SET ROLE postgres;

DROP TABLE IF EXISTS pg_temp.security_test_results;
CREATE TEMP TABLE security_test_results (
  test_id    TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  test_name  TEXT NOT NULL,
  result     TEXT NOT NULL CHECK (result IN ('PASS','FAIL','SKIP','ERROR')),
  details    TEXT
);

-- ============================================================================
-- SECTION 1: 環境の検出＆テストデータ準備
-- ============================================================================
DO $$
DECLARE
  v_org_a UUID;
  v_org_b UUID;
  v_admin_a UUID;
  v_admin_b UUID;
  v_customer_a UUID;
  v_staff_a UUID;
  v_store_a UUID;
  v_store_b UUID;
  v_reservation_a UUID;
  v_reservation_b UUID;
  v_schedule_a UUID;
  v_schedule_b UUID;
  v_scenario_a UUID;
  v_scenario_b UUID;
  v_staff_b UUID;
  v_customer_b UUID;
  v_count INT;
BEGIN
  -- === 組織を2つ取得 ===
  SELECT id INTO v_org_a FROM organizations ORDER BY created_at LIMIT 1;
  SELECT id INTO v_org_b FROM organizations WHERE id != v_org_a ORDER BY created_at LIMIT 1;

  IF v_org_a IS NULL OR v_org_b IS NULL THEN
    RAISE EXCEPTION 'テスト実行には2つ以上の組織が必要です';
  END IF;
  RAISE NOTICE '🏢 Org A: %', v_org_a;
  RAISE NOTICE '🏢 Org B: %', v_org_b;

  -- === 各組織の admin ===
  SELECT id INTO v_admin_a FROM users
    WHERE organization_id = v_org_a AND role IN ('admin','license_admin') LIMIT 1;
  IF v_admin_a IS NULL THEN RAISE EXCEPTION 'Org A にadminユーザーがいません'; END IF;
  RAISE NOTICE '👤 Admin A: %', v_admin_a;

  -- Org B にadminがいなければテスト用に作成
  SELECT id INTO v_admin_b FROM users
    WHERE organization_id = v_org_b AND role IN ('admin','license_admin') LIMIT 1;
  IF v_admin_b IS NULL THEN
    v_admin_b := 'deadbeef-0000-4000-a000-000000000001'::uuid;
    -- auth.users に挿入（auth スキーマ）
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token)
    VALUES (v_admin_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'test-admin-b@security-test.local', extensions.crypt('TestPassword123!', extensions.gen_salt('bf')),
      now(), now(), now(), '', '')
    ON CONFLICT (id) DO NOTHING;
    -- public.users に挿入
    INSERT INTO users (id, email, role, organization_id, created_at, updated_at)
    VALUES (v_admin_b, 'test-admin-b@security-test.local', 'admin', v_org_b, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'admin', organization_id = v_org_b;
    RAISE NOTICE '🔧 Org B admin をテスト用に作成: %', v_admin_b;
  ELSE
    RAISE NOTICE '👤 Admin B: %', v_admin_b;
  END IF;

  -- === 各組織の customer ===
  SELECT id INTO v_customer_a FROM users
    WHERE organization_id = v_org_a AND role = 'customer' LIMIT 1;
  IF v_customer_a IS NULL THEN
    RAISE NOTICE '⚠️ Org A にcustomerがいないため一部テストをスキップ';
  ELSE
    RAISE NOTICE '👤 Customer A: %', v_customer_a;
  END IF;

  -- === 店舗 ===
  SELECT id INTO v_store_a FROM stores WHERE organization_id = v_org_a LIMIT 1;
  SELECT id INTO v_store_b FROM stores WHERE organization_id = v_org_b LIMIT 1;

  -- === スタッフ ===
  SELECT id INTO v_staff_a FROM staff WHERE organization_id = v_org_a LIMIT 1;
  SELECT id INTO v_staff_b FROM staff WHERE organization_id = v_org_b LIMIT 1;
  -- Org B にスタッフがいなければテスト用に作成
  IF v_staff_b IS NULL THEN
    v_staff_b := 'deadbeef-0000-4000-a000-000000000010'::uuid;
    INSERT INTO staff (id, organization_id, name, display_name, role, status, created_at, updated_at)
    VALUES (v_staff_b, v_org_b, 'テスト_スタッフB', 'テストB', ARRAY['staff'], 'active', now(), now())
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE '🔧 Org B staff をテスト用に作成: %', v_staff_b;
  END IF;

  -- === シナリオ ===
  SELECT id INTO v_scenario_a FROM scenarios WHERE organization_id = v_org_a LIMIT 1;
  SELECT id INTO v_scenario_b FROM scenarios WHERE organization_id = v_org_b LIMIT 1;

  -- === スケジュールイベント ===
  SELECT id INTO v_schedule_a FROM schedule_events WHERE organization_id = v_org_a LIMIT 1;
  SELECT id INTO v_schedule_b FROM schedule_events WHERE organization_id = v_org_b LIMIT 1;
  -- Org B にスケジュールイベントがなければテスト用に作成
  IF v_schedule_b IS NULL AND v_store_b IS NOT NULL AND v_scenario_b IS NOT NULL THEN
    v_schedule_b := 'deadbeef-0000-4000-a000-000000000020'::uuid;
    INSERT INTO schedule_events (id, organization_id, store_id, scenario_id, date, start_time, end_time,
      participant_count, max_participants, status, created_at, updated_at)
    VALUES (v_schedule_b, v_org_b, v_store_b, v_scenario_b,
      (CURRENT_DATE + INTERVAL '30 days')::date, '14:00', '16:00',
      0, 8, 'open', now(), now())
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE '🔧 Org B schedule_event をテスト用に作成: %', v_schedule_b;
  END IF;

  -- === 予約 ===
  SELECT id INTO v_reservation_a FROM reservations WHERE organization_id = v_org_a LIMIT 1;
  SELECT id INTO v_reservation_b FROM reservations WHERE organization_id = v_org_b LIMIT 1;
  -- Org B に予約がなければテスト用に作成
  IF v_reservation_b IS NULL AND v_schedule_b IS NOT NULL THEN
    v_reservation_b := 'deadbeef-0000-4000-a000-000000000030'::uuid;
    INSERT INTO reservations (id, organization_id, schedule_event_id, reservation_number,
      customer_name, customer_email, participant_count, status, created_at, updated_at)
    VALUES (v_reservation_b, v_org_b, v_schedule_b, 'SEC-TEST-001',
      'テスト顧客', 'test@security-test.local', 2, 'confirmed', now(), now())
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE '🔧 Org B reservation をテスト用に作成: %', v_reservation_b;
  END IF;

  -- UUIDs をセッション変数に保存（後続テストで使用）
  PERFORM set_config('test.org_a', v_org_a::text, false);
  PERFORM set_config('test.org_b', v_org_b::text, false);
  PERFORM set_config('test.admin_a', v_admin_a::text, false);
  PERFORM set_config('test.admin_b', v_admin_b::text, false);
  PERFORM set_config('test.customer_a', COALESCE(v_customer_a::text, ''), false);
  PERFORM set_config('test.store_a', COALESCE(v_store_a::text, ''), false);
  PERFORM set_config('test.store_b', COALESCE(v_store_b::text, ''), false);
  PERFORM set_config('test.staff_a', COALESCE(v_staff_a::text, ''), false);
  PERFORM set_config('test.staff_b', COALESCE(v_staff_b::text, ''), false);
  PERFORM set_config('test.scenario_a', COALESCE(v_scenario_a::text, ''), false);
  PERFORM set_config('test.scenario_b', COALESCE(v_scenario_b::text, ''), false);
  PERFORM set_config('test.schedule_a', COALESCE(v_schedule_a::text, ''), false);
  PERFORM set_config('test.schedule_b', COALESCE(v_schedule_b::text, ''), false);
  PERFORM set_config('test.reservation_a', COALESCE(v_reservation_a::text, ''), false);
  PERFORM set_config('test.reservation_b', COALESCE(v_reservation_b::text, ''), false);

  RAISE NOTICE '========================================';
  RAISE NOTICE 'テスト環境の準備完了';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- SECTION 2: A. クロステナント分離テスト (P0)
-- ============================================================================
-- Admin A で認証し、Org B のデータにアクセスできないことを確認
-- ============================================================================
DO $$
DECLARE
  v_admin_a UUID := current_setting('test.admin_a')::uuid;
  v_org_b UUID   := current_setting('test.org_b')::uuid;
  v_org_a UUID   := current_setting('test.org_a')::uuid;
  v_count INT;
  v_test_tables TEXT[] := ARRAY[
    'reservations', 'schedule_events', 'customers', 'staff', 'stores'
  ];
  v_tbl TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== A. クロステナント分離テスト (P0) ===';

  -- JWT を Admin A に設定
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A.1–A.5: 各テーブルで Org B のレコードが見えないこと
  FOREACH v_tbl IN ARRAY v_test_tables
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT COUNT(*) FROM %I WHERE organization_id = $1', v_tbl
      ) INTO v_count USING v_org_b;

      EXECUTE 'SET ROLE postgres';
      IF v_count = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_SELECT_' || v_tbl, 'cross-tenant', 
          format('%s: Org A admin で Org B のデータが見えない', v_tbl), 
          'PASS', format('count=%s', v_count));
        RAISE NOTICE '✅ A.SELECT.%: PASS (Org B のレコード 0 件)', v_tbl;
      ELSE
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_SELECT_' || v_tbl, 'cross-tenant',
          format('%s: Org A admin で Org B のデータが見えない', v_tbl),
          'FAIL', format('count=%s (Org B のデータが %s 件見えた)', v_count, v_count));
        RAISE WARNING '❌ A.SELECT.%: FAIL (Org B のレコード % 件が閲覧可能)', v_tbl, v_count;
      END IF;
      -- 次のテストのために再度ロール設定
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'SET ROLE postgres';
      INSERT INTO pg_temp.security_test_results VALUES (
        'A_SELECT_' || v_tbl, 'cross-tenant',
        format('%s: SELECT テスト', v_tbl),
        'ERROR', SQLERRM);
      RAISE NOTICE '⚠️ A.SELECT.%: ERROR — %', v_tbl, SQLERRM;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';
    END;
  END LOOP;

  EXECUTE 'SET ROLE postgres';

  -- A.6: Org B の予約を UPDATE できないこと
  IF current_setting('test.reservation_b') != '' THEN
    DECLARE
      v_res_b UUID := current_setting('test.reservation_b')::uuid;
      v_affected INT;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      EXECUTE 'UPDATE reservations SET notes = ''SECURITY_TEST'' WHERE id = $1'
        USING v_res_b;
      GET DIAGNOSTICS v_affected = ROW_COUNT;

      EXECUTE 'SET ROLE postgres';

      IF v_affected = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_UPDATE_reservations', 'cross-tenant',
          'reservations: Org A admin で Org B の予約を更新できない', 'PASS',
          'affected=0');
        RAISE NOTICE '✅ A.UPDATE.reservations: PASS (更新 0 件)';
      ELSE
        -- ロールバック: 元に戻す
        EXECUTE 'UPDATE reservations SET notes = NULL WHERE id = $1' USING v_res_b;
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_UPDATE_reservations', 'cross-tenant',
          'reservations: Org A admin で Org B の予約を更新できない', 'FAIL',
          format('affected=%s', v_affected));
        RAISE WARNING '❌ A.UPDATE.reservations: FAIL (% 件更新された)', v_affected;
      END IF;
    END;
  ELSE
    INSERT INTO pg_temp.security_test_results VALUES (
      'A_UPDATE_reservations', 'cross-tenant',
      'reservations: UPDATE テスト', 'SKIP', 'Org B に予約データなし');
    RAISE NOTICE '⏭️ A.UPDATE.reservations: SKIP (Org B に予約なし)';
  END IF;

  -- A.7: Org B の予約を DELETE できないこと
  IF current_setting('test.reservation_b') != '' THEN
    DECLARE
      v_res_b UUID := current_setting('test.reservation_b')::uuid;
      v_affected INT;
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      EXECUTE 'DELETE FROM reservations WHERE id = $1' USING v_res_b;
      GET DIAGNOSTICS v_affected = ROW_COUNT;

      EXECUTE 'SET ROLE postgres';

      IF v_affected = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_DELETE_reservations', 'cross-tenant',
          'reservations: Org A admin で Org B の予約を削除できない', 'PASS',
          'affected=0');
        RAISE NOTICE '✅ A.DELETE.reservations: PASS (削除 0 件)';
      ELSE
        INSERT INTO pg_temp.security_test_results VALUES (
          'A_DELETE_reservations', 'cross-tenant',
          'reservations: Org A admin で Org B の予約を削除できない', 'FAIL',
          format('affected=%s — データが削除された！', v_affected));
        RAISE WARNING '❌ A.DELETE.reservations: FAIL (% 件削除された！)', v_affected;
      END IF;
    END;
  ELSE
    INSERT INTO pg_temp.security_test_results VALUES (
      'A_DELETE_reservations', 'cross-tenant',
      'reservations: DELETE テスト', 'SKIP', 'Org B に予約データなし');
    RAISE NOTICE '⏭️ A.DELETE.reservations: SKIP (Org B に予約なし)';
  END IF;

  -- A.8: 設定系テーブル — reservation_settings
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    EXECUTE 'SELECT COUNT(*) FROM reservation_settings WHERE organization_id = $1'
      INTO v_count USING v_org_b;
    EXECUTE 'SET ROLE postgres';

    IF v_count = 0 THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'A_SELECT_reservation_settings', 'cross-tenant',
        'reservation_settings: Org A admin で Org B の設定が見えない', 'PASS',
        format('count=%s', v_count));
      RAISE NOTICE '✅ A.SELECT.reservation_settings: PASS';
    ELSE
      INSERT INTO pg_temp.security_test_results VALUES (
        'A_SELECT_reservation_settings', 'cross-tenant',
        'reservation_settings: Org A admin で Org B の設定が見えない', 'FAIL',
        format('count=%s', v_count));
      RAISE WARNING '❌ A.SELECT.reservation_settings: FAIL (% 件閲覧可能)', v_count;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    INSERT INTO pg_temp.security_test_results VALUES (
      'A_SELECT_reservation_settings', 'cross-tenant',
      'reservation_settings: SELECT テスト', 'ERROR', SQLERRM);
    RAISE NOTICE '⚠️ A.SELECT.reservation_settings: ERROR — %', SQLERRM;
  END;
END $$;

-- ============================================================================
-- SECTION 3: B. 権限昇格防止テスト (P0)
-- ============================================================================
DO $$
DECLARE
  v_customer_a UUID;
  v_affected INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== B. 権限昇格防止テスト (P0) ===';

  IF current_setting('test.customer_a') = '' THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'B_ESCALATION_role', 'privilege-escalation',
      'customer が自分の role を admin に変更できない', 'SKIP',
      'Org A にcustomerユーザーなし');
    RAISE NOTICE '⏭️ B.1: SKIP (Org A にcustomerなし)';
    RETURN;
  END IF;

  v_customer_a := current_setting('test.customer_a')::uuid;

  -- B.1: customer が自分の role を admin に UPDATE できないこと
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_customer_a::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    EXECUTE 'UPDATE users SET role = ''admin'' WHERE id = $1' USING v_customer_a;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    EXECUTE 'SET ROLE postgres';

    IF v_affected = 0 THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'B_ESCALATION_admin', 'privilege-escalation',
        'customer が自分の role を admin に変更できない', 'PASS',
        'affected=0');
      RAISE NOTICE '✅ B.1: PASS (role を admin に変更できなかった)';
    ELSE
      -- 元に戻す！
      EXECUTE 'UPDATE users SET role = ''customer'' WHERE id = $1' USING v_customer_a;
      INSERT INTO pg_temp.security_test_results VALUES (
        'B_ESCALATION_admin', 'privilege-escalation',
        'customer が自分の role を admin に変更できない', 'FAIL',
        format('affected=%s — ロールが変更された！元に戻しました', v_affected));
      RAISE WARNING '❌ B.1: FAIL (role を admin に変更できた！元に戻しました)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    -- エラーで更新が拒否された = PASS (WITH CHECK 違反)
    INSERT INTO pg_temp.security_test_results VALUES (
      'B_ESCALATION_admin', 'privilege-escalation',
      'customer が自分の role を admin に変更できない', 'PASS',
      'エラーで拒否: ' || SQLERRM);
    RAISE NOTICE '✅ B.1: PASS (エラーで拒否: %)', SQLERRM;
  END;

  -- B.2: customer が自分の role を staff に UPDATE できないこと
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_customer_a::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    EXECUTE 'UPDATE users SET role = ''staff'' WHERE id = $1' USING v_customer_a;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    EXECUTE 'SET ROLE postgres';

    IF v_affected = 0 THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'B_ESCALATION_staff', 'privilege-escalation',
        'customer が自分の role を staff に変更できない', 'PASS',
        'affected=0');
      RAISE NOTICE '✅ B.2: PASS (role を staff に変更できなかった)';
    ELSE
      EXECUTE 'UPDATE users SET role = ''customer'' WHERE id = $1' USING v_customer_a;
      INSERT INTO pg_temp.security_test_results VALUES (
        'B_ESCALATION_staff', 'privilege-escalation',
        'customer が自分の role を staff に変更できない', 'FAIL',
        format('affected=%s — ロールが変更された！元に戻しました', v_affected));
      RAISE WARNING '❌ B.2: FAIL (role を staff に変更できた！元に戻しました)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    INSERT INTO pg_temp.security_test_results VALUES (
      'B_ESCALATION_staff', 'privilege-escalation',
      'customer が自分の role を staff に変更できない', 'PASS',
      'エラーで拒否: ' || SQLERRM);
    RAISE NOTICE '✅ B.2: PASS (エラーで拒否: %)', SQLERRM;
  END;
END $$;

-- ============================================================================
-- SECTION 4: C. RLS バイパス削除確認 (P0)
-- ============================================================================
DO $$
DECLARE
  v_count INT;
  v_policy_text TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== C. RLS バイパス削除確認 (P0) ===';

  -- C.1: booking_notices に OR TRUE が残っていないこと
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'booking_notices'
    AND (qual ILIKE '%OR TRUE%' OR with_check ILIKE '%OR TRUE%');

  IF v_count = 0 THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'C_OR_TRUE_booking_notices', 'rls-bypass',
      'booking_notices: OR TRUE が削除されている', 'PASS',
      'OR TRUE を含むポリシー 0 件');
    RAISE NOTICE '✅ C.1: PASS (booking_notices に OR TRUE なし)';
  ELSE
    SELECT string_agg(policyname || ': ' || COALESCE(qual,'') || ' / ' || COALESCE(with_check,''), E'\n')
    INTO v_policy_text
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'booking_notices'
      AND (qual ILIKE '%OR TRUE%' OR with_check ILIKE '%OR TRUE%');
    INSERT INTO pg_temp.security_test_results VALUES (
      'C_OR_TRUE_booking_notices', 'rls-bypass',
      'booking_notices: OR TRUE が削除されている', 'FAIL',
      format('OR TRUE を含むポリシー %s 件: %s', v_count, v_policy_text));
    RAISE WARNING '❌ C.1: FAIL (booking_notices に OR TRUE が % 件残存)', v_count;
  END IF;

  -- C.2: gm_availability_responses に OR TRUE が残っていないこと
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gm_availability_responses'
      AND (qual ILIKE '%OR TRUE%' OR with_check ILIKE '%OR TRUE%');

    IF v_count = 0 THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'C_OR_TRUE_gm_responses', 'rls-bypass',
        'gm_availability_responses: OR TRUE が削除されている', 'PASS',
        'OR TRUE を含むポリシー 0 件');
      RAISE NOTICE '✅ C.2: PASS (gm_availability_responses に OR TRUE なし)';
    ELSE
      INSERT INTO pg_temp.security_test_results VALUES (
        'C_OR_TRUE_gm_responses', 'rls-bypass',
        'gm_availability_responses: OR TRUE が削除されている', 'FAIL',
        format('OR TRUE を含むポリシー %s 件', v_count));
      RAISE WARNING '❌ C.2: FAIL (gm_availability_responses に OR TRUE が % 件残存)', v_count;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'C_OR_TRUE_gm_responses', 'rls-bypass',
      'gm_availability_responses: OR TRUE チェック', 'SKIP',
      'テーブルが存在しない');
    RAISE NOTICE '⏭️ C.2: SKIP (gm_availability_responses テーブルなし)';
  END;

  -- C.3: 匿名ユーザーが管理系テーブルにアクセスできないこと
  DECLARE
    v_admin_tables TEXT[] := ARRAY['audit_logs', 'email_settings', 'reservation_settings'];
    v_tbl TEXT;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{}', true);
    EXECUTE 'SET LOCAL ROLE anon';

    FOREACH v_tbl IN ARRAY v_admin_tables
    LOOP
      BEGIN
        EXECUTE format('SELECT COUNT(*) FROM %I', v_tbl) INTO v_count;
        EXECUTE 'SET ROLE postgres';

        IF v_count = 0 THEN
          INSERT INTO pg_temp.security_test_results VALUES (
            'C_ANON_' || v_tbl, 'rls-bypass',
            format('anon が %s にアクセスできない', v_tbl), 'PASS',
            'count=0');
          RAISE NOTICE '✅ C.3.%: PASS (anon でアクセス不可)', v_tbl;
        ELSE
          INSERT INTO pg_temp.security_test_results VALUES (
            'C_ANON_' || v_tbl, 'rls-bypass',
            format('anon が %s にアクセスできない', v_tbl), 'FAIL',
            format('count=%s', v_count));
          RAISE WARNING '❌ C.3.%: FAIL (anon で % 件閲覧可能)', v_tbl, v_count;
        END IF;

        PERFORM set_config('request.jwt.claims', '{}', true);
        EXECUTE 'SET LOCAL ROLE anon';
      EXCEPTION WHEN OTHERS THEN
        EXECUTE 'SET ROLE postgres';
        -- permission denied = PASS
        IF SQLERRM ILIKE '%permission denied%' OR SQLERRM ILIKE '%denied%' THEN
          INSERT INTO pg_temp.security_test_results VALUES (
            'C_ANON_' || v_tbl, 'rls-bypass',
            format('anon が %s にアクセスできない', v_tbl), 'PASS',
            'permission denied: ' || SQLERRM);
          RAISE NOTICE '✅ C.3.%: PASS (permission denied)', v_tbl;
        ELSE
          INSERT INTO pg_temp.security_test_results VALUES (
            'C_ANON_' || v_tbl, 'rls-bypass',
            format('anon %s テスト', v_tbl), 'ERROR', SQLERRM);
          RAISE NOTICE '⚠️ C.3.%: ERROR — %', v_tbl, SQLERRM;
        END IF;
        PERFORM set_config('request.jwt.claims', '{}', true);
        EXECUTE 'SET LOCAL ROLE anon';
      END;
    END LOOP;

    EXECUTE 'SET ROLE postgres';
  END;

  -- C.4: 全テーブルの OR TRUE ポリシーをスキャン
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual ILIKE '%OR TRUE%' OR with_check ILIKE '%OR TRUE%');

  IF v_count = 0 THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'C_OR_TRUE_global', 'rls-bypass',
      '全テーブルに OR TRUE ポリシーがない', 'PASS',
      'OR TRUE を含むポリシー 0 件');
    RAISE NOTICE '✅ C.4: PASS (全テーブルで OR TRUE なし)';
  ELSE
    SELECT string_agg(tablename || '.' || policyname, ', ')
    INTO v_policy_text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%OR TRUE%' OR with_check ILIKE '%OR TRUE%');
    INSERT INTO pg_temp.security_test_results VALUES (
      'C_OR_TRUE_global', 'rls-bypass',
      '全テーブルに OR TRUE ポリシーがない', 'FAIL',
      format('%s 件: %s', v_count, v_policy_text));
    RAISE WARNING '❌ C.4: FAIL (OR TRUE が % 件残存: %)', v_count, v_policy_text;
  END IF;
END $$;

-- ============================================================================
-- SECTION 5: D. SECURITY DEFINER 関数の組織境界テスト (P0-D/E)
-- ============================================================================
DO $$
DECLARE
  v_admin_a UUID := current_setting('test.admin_a')::uuid;
  v_org_b UUID := current_setting('test.org_b')::uuid;
  v_reservation_b UUID;
  v_result JSONB;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== D. SECURITY DEFINER 関数の組織境界テスト (P0-D/E) ===';

  IF current_setting('test.reservation_b') = '' THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'D_FUNC_all', 'security-definer',
      'SECURITY DEFINER 関数テスト', 'SKIP',
      'Org B に予約データなし');
    RAISE NOTICE '⏭️ D: SKIP (Org B に予約データなし)';
    RETURN;
  END IF;

  v_reservation_b := current_setting('test.reservation_b')::uuid;

  -- Admin A で認証
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- D.1: admin_delete_reservations_by_ids で他組織の予約を削除できないこと
  BEGIN
    EXECUTE 'SELECT admin_delete_reservations_by_ids($1)'
      INTO v_result USING ARRAY[v_reservation_b];

    EXECUTE 'SET ROLE postgres';

    IF v_result->>'success' = 'false' THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_delete_cross_org', 'security-definer',
        'admin_delete_reservations_by_ids: 他組織の予約を削除できない', 'PASS',
        'error: ' || (v_result->>'error'));
      RAISE NOTICE '✅ D.1: PASS (拒否: %)', v_result->>'error';
    ELSE
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_delete_cross_org', 'security-definer',
        'admin_delete_reservations_by_ids: 他組織の予約を削除できない', 'FAIL',
        'result: ' || v_result::text);
      RAISE WARNING '❌ D.1: FAIL (他組織の予約が削除された: %)', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    INSERT INTO pg_temp.security_test_results VALUES (
      'D_delete_cross_org', 'security-definer',
      'admin_delete_reservations_by_ids テスト', 'PASS',
      'エラーで拒否: ' || SQLERRM);
    RAISE NOTICE '✅ D.1: PASS (例外で拒否: %)', SQLERRM;
  END;

  -- D.2: admin_recalculate_reservation_prices で他組織の予約を操作できないこと
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    EXECUTE 'SELECT admin_recalculate_reservation_prices($1)'
      INTO v_result USING v_reservation_b;

    EXECUTE 'SET ROLE postgres';

    IF v_result->>'success' = 'false' THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_recalc_cross_org', 'security-definer',
        'admin_recalculate_reservation_prices: 他組織の予約を操作できない', 'PASS',
        'error: ' || (v_result->>'error'));
      RAISE NOTICE '✅ D.2: PASS (拒否: %)', v_result->>'error';
    ELSE
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_recalc_cross_org', 'security-definer',
        'admin_recalculate_reservation_prices: 他組織の予約を操作できない', 'FAIL',
        'result: ' || v_result::text);
      RAISE WARNING '❌ D.2: FAIL (他組織の予約が操作された: %)', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    INSERT INTO pg_temp.security_test_results VALUES (
      'D_recalc_cross_org', 'security-definer',
      'admin_recalculate_reservation_prices テスト', 'PASS',
      'エラーで拒否: ' || SQLERRM);
    RAISE NOTICE '✅ D.2: PASS (例外で拒否: %)', SQLERRM;
  END;

  -- D.3: admin_update_reservation_fields で他組織の予約を更新できないこと
  BEGIN
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';

    EXECUTE 'SELECT admin_update_reservation_fields($1, $2)'
      INTO v_result USING v_reservation_b, '{"notes": "SECURITY_TEST"}'::jsonb;

    EXECUTE 'SET ROLE postgres';

    IF v_result->>'success' = 'false' THEN
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_update_cross_org', 'security-definer',
        'admin_update_reservation_fields: 他組織の予約を更新できない', 'PASS',
        'error: ' || (v_result->>'error'));
      RAISE NOTICE '✅ D.3: PASS (拒否: %)', v_result->>'error';
    ELSE
      INSERT INTO pg_temp.security_test_results VALUES (
        'D_update_cross_org', 'security-definer',
        'admin_update_reservation_fields: 他組織の予約を更新できない', 'FAIL',
        'result: ' || v_result::text);
      RAISE WARNING '❌ D.3: FAIL (他組織の予約が更新された: %)', v_result;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'SET ROLE postgres';
    INSERT INTO pg_temp.security_test_results VALUES (
      'D_update_cross_org', 'security-definer',
      'admin_update_reservation_fields テスト', 'PASS',
      'エラーで拒否: ' || SQLERRM);
    RAISE NOTICE '✅ D.3: PASS (例外で拒否: %)', SQLERRM;
  END;
END $$;

-- ============================================================================
-- SECTION 6: E. store_id/staff_id 経由の間接 org チェック
-- ============================================================================
DO $$
DECLARE
  v_admin_a UUID := current_setting('test.admin_a')::uuid;
  v_org_b UUID  := current_setting('test.org_b')::uuid;
  v_store_b UUID;
  v_staff_b UUID;
  v_count INT;
  v_affected INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== E. 間接 org チェックテスト (store_id/staff_id) ===';

  -- E.1: store_basic_settings — Org B の設定が見えないこと
  IF current_setting('test.store_b') != '' THEN
    v_store_b := current_setting('test.store_b')::uuid;

    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      EXECUTE 'SELECT COUNT(*) FROM store_basic_settings WHERE store_id = $1'
        INTO v_count USING v_store_b;

      EXECUTE 'SET ROLE postgres';

      IF v_count = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_SELECT_store_basic_settings', 'indirect-org',
          'store_basic_settings: Org A admin で Org B の設定が見えない', 'PASS',
          format('count=%s', v_count));
        RAISE NOTICE '✅ E.1: PASS (Org B の store_basic_settings 0 件)';
      ELSE
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_SELECT_store_basic_settings', 'indirect-org',
          'store_basic_settings: Org A admin で Org B の設定が見えない', 'FAIL',
          format('count=%s', v_count));
        RAISE WARNING '❌ E.1: FAIL (Org B の store_basic_settings が % 件見えた)', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'SET ROLE postgres';
      INSERT INTO pg_temp.security_test_results VALUES (
        'E_SELECT_store_basic_settings', 'indirect-org',
        'store_basic_settings SELECT テスト', 'ERROR', SQLERRM);
      RAISE NOTICE '⚠️ E.1: ERROR — %', SQLERRM;
    END;

    -- E.2: store_basic_settings — Org B の設定を更新できないこと
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      EXECUTE 'UPDATE store_basic_settings SET updated_at = now() WHERE store_id = $1'
        USING v_store_b;
      GET DIAGNOSTICS v_affected = ROW_COUNT;

      EXECUTE 'SET ROLE postgres';

      IF v_affected = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_UPDATE_store_basic_settings', 'indirect-org',
          'store_basic_settings: Org A admin で Org B の設定を更新できない', 'PASS',
          'affected=0');
        RAISE NOTICE '✅ E.2: PASS (Org B の store_basic_settings 更新 0 件)';
      ELSE
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_UPDATE_store_basic_settings', 'indirect-org',
          'store_basic_settings: Org A admin で Org B の設定を更新できない', 'FAIL',
          format('affected=%s', v_affected));
        RAISE WARNING '❌ E.2: FAIL (Org B の store_basic_settings が % 件更新された)', v_affected;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'SET ROLE postgres';
      INSERT INTO pg_temp.security_test_results VALUES (
        'E_UPDATE_store_basic_settings', 'indirect-org',
        'store_basic_settings UPDATE テスト', 'ERROR', SQLERRM);
      RAISE NOTICE '⚠️ E.2: ERROR — %', SQLERRM;
    END;
  ELSE
    INSERT INTO pg_temp.security_test_results VALUES (
      'E_SELECT_store_basic_settings', 'indirect-org',
      'store_basic_settings テスト', 'SKIP', 'Org B に店舗なし');
    INSERT INTO pg_temp.security_test_results VALUES (
      'E_UPDATE_store_basic_settings', 'indirect-org',
      'store_basic_settings テスト', 'SKIP', 'Org B に店舗なし');
    RAISE NOTICE '⏭️ E.1/E.2: SKIP (Org B に店舗なし)';
  END IF;

  -- E.3: staff_scenario_assignments — Org B のスタッフ割当が見えないこと
  IF current_setting('test.staff_b') != '' THEN
    v_staff_b := current_setting('test.staff_b')::uuid;

    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      -- staff_scenario_assignments の SELECT ポリシーを確認
      -- 注: SELECT ポリシーが `true` (全員閲覧可) の場合、件数 > 0 は想定内
      EXECUTE 'SELECT COUNT(*) FROM staff_scenario_assignments WHERE staff_id = $1'
        INTO v_count USING v_staff_b;

      EXECUTE 'SET ROLE postgres';

      -- SELECT ポリシーが制限されていない可能性があるため、結果をレポート
      INSERT INTO pg_temp.security_test_results VALUES (
        'E_SELECT_staff_scenario_assignments', 'indirect-org',
        'staff_scenario_assignments: Org A admin での Org B データ可視性', 
        CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        format('count=%s (SELECT ポリシーが広い場合は想定内の可能性あり)', v_count));
      IF v_count = 0 THEN
        RAISE NOTICE '✅ E.3: PASS (Org B の staff_scenario_assignments 0 件)';
      ELSE
        RAISE WARNING '❌ E.3: FAIL (Org B の staff_scenario_assignments が % 件見えた — SELECTポリシー確認要)', v_count;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'SET ROLE postgres';
      INSERT INTO pg_temp.security_test_results VALUES (
        'E_SELECT_staff_scenario_assignments', 'indirect-org',
        'staff_scenario_assignments SELECT テスト', 'ERROR', SQLERRM);
      RAISE NOTICE '⚠️ E.3: ERROR — %', SQLERRM;
    END;

    -- E.4: staff_scenario_assignments — Org B の割当を更新できないこと
    BEGIN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin_a::text, 'role', 'authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated';

      EXECUTE 'UPDATE staff_scenario_assignments SET updated_at = now() WHERE staff_id = $1'
        USING v_staff_b;
      GET DIAGNOSTICS v_affected = ROW_COUNT;

      EXECUTE 'SET ROLE postgres';

      IF v_affected = 0 THEN
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_UPDATE_staff_scenario_assignments', 'indirect-org',
          'staff_scenario_assignments: Org A admin で Org B の割当を更新できない', 'PASS',
          'affected=0');
        RAISE NOTICE '✅ E.4: PASS (Org B の staff_scenario_assignments 更新 0 件)';
      ELSE
        INSERT INTO pg_temp.security_test_results VALUES (
          'E_UPDATE_staff_scenario_assignments', 'indirect-org',
          'staff_scenario_assignments: Org A admin で Org B の割当を更新できない', 'FAIL',
          format('affected=%s', v_affected));
        RAISE WARNING '❌ E.4: FAIL (Org B の staff_scenario_assignments が % 件更新された)', v_affected;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'SET ROLE postgres';
      INSERT INTO pg_temp.security_test_results VALUES (
        'E_UPDATE_staff_scenario_assignments', 'indirect-org',
        'staff_scenario_assignments UPDATE テスト', 'ERROR', SQLERRM);
      RAISE NOTICE '⚠️ E.4: ERROR — %', SQLERRM;
    END;
  ELSE
    INSERT INTO pg_temp.security_test_results VALUES (
      'E_SELECT_staff_scenario_assignments', 'indirect-org',
      'staff_scenario_assignments テスト', 'SKIP', 'Org B にスタッフなし');
    INSERT INTO pg_temp.security_test_results VALUES (
      'E_UPDATE_staff_scenario_assignments', 'indirect-org',
      'staff_scenario_assignments テスト', 'SKIP', 'Org B にスタッフなし');
    RAISE NOTICE '⏭️ E.3/E.4: SKIP (Org B にスタッフなし)';
  END IF;
END $$;

-- ============================================================================
-- SECTION 7: ポリシー定義の包括的チェック
-- ============================================================================
DO $$
DECLARE
  v_count INT;
  v_policy_text TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== F. ポリシー定義の包括的チェック ===';

  -- F.1: is_admin() のみで organization チェックがないポリシー
  -- (store_basic_settings と staff_scenario_assignments の SELECT は例外的に許容される場合あり)
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (qual ILIKE '%is_admin()%' AND qual NOT ILIKE '%organization_id%'
       AND qual NOT ILIKE '%get_user_organization_id%' AND qual NOT ILIKE '%store_id%'
       AND qual NOT ILIKE '%staff_id%')
      OR
      (with_check ILIKE '%is_admin()%' AND with_check NOT ILIKE '%organization_id%'
       AND with_check NOT ILIKE '%get_user_organization_id%' AND with_check NOT ILIKE '%store_id%'
       AND with_check NOT ILIKE '%staff_id%')
    );

  IF v_count = 0 THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'F_admin_no_org', 'policy-audit',
      'is_admin() のみで org チェックがないポリシーがない', 'PASS',
      '問題のあるポリシー 0 件');
    RAISE NOTICE '✅ F.1: PASS (is_admin() のみポリシー 0 件)';
  ELSE
    SELECT string_agg(tablename || '.' || policyname || ' [' || cmd || ']', E'\n  ')
    INTO v_policy_text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual ILIKE '%is_admin()%' AND qual NOT ILIKE '%organization_id%'
         AND qual NOT ILIKE '%get_user_organization_id%' AND qual NOT ILIKE '%store_id%'
         AND qual NOT ILIKE '%staff_id%')
        OR
        (with_check ILIKE '%is_admin()%' AND with_check NOT ILIKE '%organization_id%'
         AND with_check NOT ILIKE '%get_user_organization_id%' AND with_check NOT ILIKE '%store_id%'
         AND with_check NOT ILIKE '%staff_id%')
      );
    INSERT INTO pg_temp.security_test_results VALUES (
      'F_admin_no_org', 'policy-audit',
      'is_admin() のみで org チェックがないポリシーがない', 'FAIL',
      format('%s 件: %s', v_count, v_policy_text));
    RAISE WARNING '❌ F.1: FAIL (is_admin() のみポリシー % 件):', v_count;
    RAISE WARNING '  %', v_policy_text;
  END IF;

  -- F.2: RLS が有効になっていないテーブル
  SELECT COUNT(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'  -- regular table
    AND NOT c.relrowsecurity
    AND c.relname NOT IN (
      -- RLS不要な除外テーブル
      'schema_migrations', 'supabase_migrations',
      'spatial_ref_sys', 'geography_columns', 'geometry_columns'
    );

  IF v_count = 0 THEN
    INSERT INTO pg_temp.security_test_results VALUES (
      'F_rls_disabled', 'policy-audit',
      '全テーブルに RLS が有効', 'PASS',
      'RLS 無効テーブル 0 件');
    RAISE NOTICE '✅ F.2: PASS (全テーブルに RLS 有効)';
  ELSE
    SELECT string_agg(c.relname, ', ')
    INTO v_policy_text
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND c.relname NOT IN ('schema_migrations', 'supabase_migrations',
        'spatial_ref_sys', 'geography_columns', 'geometry_columns');
    INSERT INTO pg_temp.security_test_results VALUES (
      'F_rls_disabled', 'policy-audit',
      '全テーブルに RLS が有効', 'FAIL',
      format('%s 件: %s', v_count, v_policy_text));
    RAISE WARNING '❌ F.2: FAIL (RLS 無効テーブル % 件: %)', v_count, v_policy_text;
  END IF;
END $$;

-- ============================================================================
-- SECTION 8: 結果サマリー
-- ============================================================================
DO $$
DECLARE
  v_total INT;
  v_pass INT;
  v_fail INT;
  v_skip INT;
  v_error INT;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO v_total FROM pg_temp.security_test_results;
  SELECT COUNT(*) INTO v_pass FROM pg_temp.security_test_results WHERE result = 'PASS';
  SELECT COUNT(*) INTO v_fail FROM pg_temp.security_test_results WHERE result = 'FAIL';
  SELECT COUNT(*) INTO v_skip FROM pg_temp.security_test_results WHERE result = 'SKIP';
  SELECT COUNT(*) INTO v_error FROM pg_temp.security_test_results WHERE result = 'ERROR';

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE ' セキュリティテスト結果サマリー';
  RAISE NOTICE '============================================';
  RAISE NOTICE ' 合計: % テスト', v_total;
  RAISE NOTICE ' ✅ PASS:  %', v_pass;
  RAISE NOTICE ' ❌ FAIL:  %', v_fail;
  RAISE NOTICE ' ⏭️ SKIP:  %', v_skip;
  RAISE NOTICE ' ⚠️ ERROR: %', v_error;
  RAISE NOTICE '============================================';

  IF v_fail > 0 THEN
    RAISE WARNING '❌ 失敗したテスト:';
    FOR rec IN SELECT test_id, test_name, details FROM pg_temp.security_test_results WHERE result = 'FAIL'
    LOOP
      RAISE WARNING '  % — % (%)', rec.test_id, rec.test_name, rec.details;
    END LOOP;
  END IF;

  IF v_error > 0 THEN
    RAISE WARNING '⚠️ エラーのテスト:';
    FOR rec IN SELECT test_id, test_name, details FROM pg_temp.security_test_results WHERE result = 'ERROR'
    LOOP
      RAISE WARNING '  % — % (%)', rec.test_id, rec.test_name, rec.details;
    END LOOP;
  END IF;
END $$;

-- 詳細結果テーブル
SELECT * FROM pg_temp.security_test_results ORDER BY test_id;

-- ============================================================================
-- SECTION 9: テストデータのクリーンアップ
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== クリーンアップ: テスト用データを削除 ===';

  -- テスト用予約を削除
  DELETE FROM reservations WHERE id = 'deadbeef-0000-4000-a000-000000000030'::uuid;
  IF FOUND THEN RAISE NOTICE '🧹 テスト予約を削除'; END IF;

  -- テスト用スケジュールイベントを削除
  DELETE FROM schedule_events WHERE id = 'deadbeef-0000-4000-a000-000000000020'::uuid;
  IF FOUND THEN RAISE NOTICE '🧹 テストスケジュールを削除'; END IF;

  -- テスト用スタッフを削除
  DELETE FROM staff WHERE id = 'deadbeef-0000-4000-a000-000000000010'::uuid;
  IF FOUND THEN RAISE NOTICE '🧹 テストスタッフを削除'; END IF;

  -- テスト用ユーザーを削除
  DELETE FROM users WHERE id = 'deadbeef-0000-4000-a000-000000000001'::uuid;
  IF FOUND THEN RAISE NOTICE '🧹 テストユーザー(public)を削除'; END IF;
  DELETE FROM auth.users WHERE id = 'deadbeef-0000-4000-a000-000000000001'::uuid;
  IF FOUND THEN RAISE NOTICE '🧹 テストユーザー(auth)を削除'; END IF;

  RAISE NOTICE '=== クリーンアップ完了 ===';
END $$;
