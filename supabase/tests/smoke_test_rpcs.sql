-- =============================================================================
-- RPCスモークテスト
-- =============================================================================
-- マイグレーション適用後に実行し、全RPC関数が構文エラーなく動作するか検証する。
-- PL/pgSQL は関数作成時ではなく初回実行時にボディを解析するため、
-- このテストなしでは構文エラーが本番で初めて発覚する。
--
-- 使い方:
--   psql -f supabase/tests/smoke_test_rpcs.sql
--   npm run test:rpcs (supabase local 起動中)
-- =============================================================================

-- テスト用のダミーUUID
\set dummy_uuid '00000000-0000-0000-0000-000000000000'

BEGIN;

-- カウンター
CREATE TEMP TABLE _smoke_results (
  func_name TEXT,
  status TEXT,
  detail TEXT
);

-- ============================================================
-- ヘルパー: 各RPCを呼び出し、構文エラー(42xxx)なら FAIL、それ以外は PASS
-- ============================================================

-- 1. check_performances_day_before
DO $$
BEGIN
  PERFORM check_performances_day_before();
  INSERT INTO _smoke_results VALUES ('check_performances_day_before', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('check_performances_day_before', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('check_performances_day_before', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 2. check_performances_four_hours_before
DO $$
BEGIN
  PERFORM check_performances_four_hours_before();
  INSERT INTO _smoke_results VALUES ('check_performances_four_hours_before', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('check_performances_four_hours_before', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('check_performances_four_hours_before', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 3. calculate_cancellation_fee
DO $$
BEGIN
  PERFORM calculate_cancellation_fee('00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO _smoke_results VALUES ('calculate_cancellation_fee', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('calculate_cancellation_fee', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('calculate_cancellation_fee', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 4. cancel_reservation_with_lock (2-param)
DO $$
BEGIN
  PERFORM cancel_reservation_with_lock('00000000-0000-0000-0000-000000000000'::uuid, 'smoke_test');
  INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,text)', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,text)', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,text)', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 5. cancel_reservation_with_lock (3-param)
DO $$
BEGIN
  PERFORM cancel_reservation_with_lock(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'smoke_test'
  );
  INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,uuid,text)', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,uuid,text)', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('cancel_reservation_with_lock(uuid,uuid,text)', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 6. update_reservation_participants
DO $$
BEGIN
  PERFORM update_reservation_participants(
    '00000000-0000-0000-0000-000000000000'::uuid,
    1,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
  INSERT INTO _smoke_results VALUES ('update_reservation_participants', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('update_reservation_participants', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('update_reservation_participants', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 7. recalc_current_participants_for_event
DO $$
BEGIN
  PERFORM recalc_current_participants_for_event('00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO _smoke_results VALUES ('recalc_current_participants_for_event', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('recalc_current_participants_for_event', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('recalc_current_participants_for_event', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 8. admin_delete_reservations_by_ids
DO $$
BEGIN
  PERFORM admin_delete_reservations_by_ids(ARRAY['00000000-0000-0000-0000-000000000000']::uuid[]);
  INSERT INTO _smoke_results VALUES ('admin_delete_reservations_by_ids', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('admin_delete_reservations_by_ids', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('admin_delete_reservations_by_ids', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 9. admin_recalculate_reservation_prices
DO $$
BEGIN
  PERFORM admin_recalculate_reservation_prices('00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO _smoke_results VALUES ('admin_recalculate_reservation_prices', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('admin_recalculate_reservation_prices', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('admin_recalculate_reservation_prices', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 10. get_user_organization_id
DO $$
BEGIN
  PERFORM get_user_organization_id();
  INSERT INTO _smoke_results VALUES ('get_user_organization_id', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('get_user_organization_id', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('get_user_organization_id', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 11. is_org_admin
DO $$
BEGIN
  PERFORM is_org_admin();
  INSERT INTO _smoke_results VALUES ('is_org_admin', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('is_org_admin', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('is_org_admin', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 12. generate_invite_code
DO $$
BEGIN
  PERFORM generate_invite_code();
  INSERT INTO _smoke_results VALUES ('generate_invite_code', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('generate_invite_code', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('generate_invite_code', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 13. get_public_available_scenario_keys
DO $$
BEGIN
  PERFORM get_public_available_scenario_keys();
  INSERT INTO _smoke_results VALUES ('get_public_available_scenario_keys', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('get_public_available_scenario_keys', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('get_public_available_scenario_keys', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 14. get_scenario_likes_count
DO $$
BEGIN
  PERFORM get_scenario_likes_count();
  INSERT INTO _smoke_results VALUES ('get_scenario_likes_count', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('get_scenario_likes_count', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('get_scenario_likes_count', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 15. validate_reservation_status_transition
DO $$
BEGIN
  PERFORM validate_reservation_status_transition('pending', 'confirmed');
  INSERT INTO _smoke_results VALUES ('validate_reservation_status_transition', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('validate_reservation_status_transition', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('validate_reservation_status_transition', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- 16. get_all_authors
DO $$
BEGIN
  PERFORM get_all_authors();
  INSERT INTO _smoke_results VALUES ('get_all_authors', 'PASS', NULL);
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE LIKE '42%' THEN
    INSERT INTO _smoke_results VALUES ('get_all_authors', 'FAIL', SQLERRM);
  ELSE
    INSERT INTO _smoke_results VALUES ('get_all_authors', 'PASS', 'expected error: ' || SQLERRM);
  END IF;
END $$;

-- ============================================================
-- 結果出力
-- ============================================================
SELECT
  CASE WHEN status = 'FAIL' THEN '❌' ELSE '✅' END AS result,
  func_name,
  detail
FROM _smoke_results
ORDER BY status DESC, func_name;

-- FAILがあればエラーで終了
DO $$
DECLARE
  v_fail_count INTEGER;
  v_total INTEGER;
  v_fails TEXT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM _smoke_results;
  SELECT COUNT(*) INTO v_fail_count FROM _smoke_results WHERE status = 'FAIL';

  IF v_fail_count > 0 THEN
    SELECT string_agg(func_name || ': ' || detail, E'\n')
    INTO v_fails
    FROM _smoke_results WHERE status = 'FAIL';

    RAISE EXCEPTION E'RPC smoke test FAILED: %/% functions broken\n%', v_fail_count, v_total, v_fails;
  ELSE
    RAISE NOTICE 'RPC smoke test PASSED: all % functions OK', v_total;
  END IF;
END $$;

ROLLBACK;
