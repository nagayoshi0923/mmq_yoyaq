-- YOYAQ-005: 契約店舗トークンRPCの境界テスト
-- migration適用済みの使い捨てlocal DB専用。staging/prodでは実行しない。
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.organizations (id, name, slug, plan, is_active, booking_site_status)
VALUES
  ('15000000-0000-0000-0000-000000000001', 'YOYAQ-005 org A', 'yoyaq-005-org-a', 'pro', TRUE, 'approved'),
  ('15000000-0000-0000-0000-000000000002', 'YOYAQ-005 org B', 'yoyaq-005-org-b', 'pro', TRUE, 'approved');

INSERT INTO public.scenario_masters (
  id, title, author, author_email, player_count_min, player_count_max, official_duration, master_status
)
VALUES
  ('35000000-0000-0000-0000-000000000001', 'YOYAQ-005 managed A', '作者A', 'author-a@example.com', 4, 6, 180, 'approved'),
  ('35000000-0000-0000-0000-000000000002', 'YOYAQ-005 managed B', '作者B', 'author-b@example.com', 4, 6, 180, 'approved'),
  ('35000000-0000-0000-0000-000000000003', 'YOYAQ-005 other work', '作者C', 'author-c@example.com', 4, 6, 180, 'approved');

INSERT INTO public.organization_scenarios (
  organization_id, scenario_master_id, org_status, scenario_type, license_amount, franchise_license_amount, external_license_amount
)
VALUES
  ('15000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'available', 'managed', 2000, 3000, 5000),
  ('15000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 'available', 'managed', 2500, 0, 0),
  ('15000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000003', 'available', 'normal', 1000, 1000, 1000),
  ('15000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', 'available', 'managed', 9999, 9999, 8888);

INSERT INTO public.license_partner_stores (
  id, organization_id, name, discord_channel_id, report_token, is_active
)
VALUES
  (
    '45000000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    'アナーキー様',
    '1530000000000000001',
    'yoyaq005-valid-token-aaaaaaaaaaaaaaaaaa',
    TRUE
  ),
  (
    '45000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    '他テナント店',
    '1530000000000000002',
    'yoyaq005-other-org-token-bbbbbbbbbbbbbb',
    TRUE
  ),
  (
    '45000000-0000-0000-0000-000000000003',
    '15000000-0000-0000-0000-000000000001',
    '停止店',
    NULL,
    'yoyaq005-inactive-token-cccccccccccccccc',
    FALSE
  );

INSERT INTO public.license_partner_contracts (
  organization_id, partner_store_id, scenario_master_id, license_amount
)
VALUES
  ('15000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', NULL),
  ('15000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 4000),
  ('15000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', 1111);

DO $$
DECLARE
  v_form JSONB;
  v_result JSONB;
  v_count INTEGER;
BEGIN
  IF public.get_license_partner_report_form('short', 2026, 7) IS NOT NULL THEN
    RAISE EXCEPTION '短いトークンが通った';
  END IF;

  IF public.get_license_partner_report_form('yoyaq005-unknown-token-dddddddddddddd', 2026, 7) IS NOT NULL THEN
    RAISE EXCEPTION '未知トークンが通った';
  END IF;

  IF public.get_license_partner_report_form('yoyaq005-inactive-token-cccccccccccccccc', 2026, 7) IS NOT NULL THEN
    RAISE EXCEPTION '停止店舗のトークンが通った';
  END IF;

  v_form := public.get_license_partner_report_form('yoyaq005-valid-token-aaaaaaaaaaaaaaaaaa', 2026, 7);
  IF v_form IS NULL
     OR v_form->>'partner_store_name' IS DISTINCT FROM 'アナーキー様'
     OR jsonb_array_length(v_form->'items') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION '正当トークンのフォームが不正: %', v_form;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_form->'items') item
    WHERE item->>'scenario_master_id' = '35000000-0000-0000-0000-000000000003'
  ) THEN
    RAISE EXCEPTION '管理作品以外がフォームに出た';
  END IF;

  IF (v_form->'items'->0->>'license_amount')::INTEGER NOT IN (5000, 4000)
     OR (v_form->'items'->1->>'license_amount')::INTEGER NOT IN (5000, 4000) THEN
    RAISE EXCEPTION '単価解決が不正: %', v_form->'items';
  END IF;

  v_form := public.get_license_partner_report_form('yoyaq005-other-org-token-bbbbbbbbbbbbbb', 2026, 7);
  IF jsonb_array_length(v_form->'items') IS DISTINCT FROM 1
     OR v_form->>'partner_store_name' IS DISTINCT FROM '他テナント店' THEN
    RAISE EXCEPTION '他テナントの契約が分離されていない: %', v_form;
  END IF;

  v_result := public.submit_license_partner_monthly_report(
    'yoyaq005-valid-token-aaaaaaaaaaaaaaaaaa',
    2026,
    7,
    '[{"scenario_master_id":"35000000-0000-0000-0000-000000000001","performance_count":3}]'::jsonb
  );
  IF (v_result->>'success')::BOOLEAN IS DISTINCT FROM TRUE
     OR (v_result->>'updated_count')::INTEGER IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '正当な送信が失敗: %', v_result;
  END IF;

  SELECT performance_count INTO v_count
  FROM public.license_partner_monthly_reports
  WHERE partner_store_id = '45000000-0000-0000-0000-000000000001'
    AND scenario_master_id = '35000000-0000-0000-0000-000000000001'
    AND year = 2026
    AND month = 7;
  IF v_count IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'upsert後の回数が不正: %', v_count;
  END IF;

  v_form := public.get_license_partner_report_form('yoyaq005-valid-token-aaaaaaaaaaaaaaaaaa', 2026, 7);
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_form->'items') item
    WHERE item->>'scenario_master_id' = '35000000-0000-0000-0000-000000000001'
      AND (item->>'performance_count')::INTEGER = 3
  ) THEN
    RAISE EXCEPTION '送信後の回数がフォームに出ていない';
  END IF;

  BEGIN
    PERFORM public.submit_license_partner_monthly_report(
      'yoyaq005-valid-token-aaaaaaaaaaaaaaaaaa',
      2026,
      7,
      '[{"scenario_master_id":"35000000-0000-0000-0000-000000000003","performance_count":1}]'::jsonb
    );
    RAISE EXCEPTION '契約外シナリオの送信が通った';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM public.submit_license_partner_monthly_report(
      'yoyaq005-unknown-token-dddddddddddddd',
      2026,
      7,
      '[{"scenario_master_id":"35000000-0000-0000-0000-000000000001","performance_count":1}]'::jsonb
    );
    RAISE EXCEPTION '未知トークンの送信が通った';
  EXCEPTION
    WHEN invalid_authorization_specification THEN
      NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.license_partner_stores', 'SELECT')
     OR has_table_privilege('anon', 'public.license_partner_contracts', 'SELECT')
     OR has_table_privilege('anon', 'public.license_partner_monthly_reports', 'SELECT') THEN
    RAISE EXCEPTION 'anon に契約店舗テーブルの SELECT が付いている';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_license_partner_report_form(text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_license_partner_report_form(text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.submit_license_partner_monthly_report(text,integer,integer,jsonb)', 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid = 'public.get_license_partner_report_form(text,integer,integer)'::regprocedure
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'RPC execute権限が最小公開設定ではありません';
  END IF;
END;
$$;

ROLLBACK;
