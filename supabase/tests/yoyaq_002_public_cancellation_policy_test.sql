-- YOYAQ-002: 公開キャンセルポリシーRPCのtenant/store境界テスト
-- migration適用済みの使い捨てlocal DB専用。staging/prodでは実行しない。
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.organizations (id, name, slug, plan, is_active, booking_site_status)
VALUES
  ('12000000-0000-0000-0000-000000000001', 'YOYAQ-002 org A', 'yoyaq-002-org-a', 'pro', TRUE, 'approved'),
  ('12000000-0000-0000-0000-000000000002', 'YOYAQ-002 org B', 'yoyaq-002-org-b', 'pro', TRUE, 'approved'),
  ('12000000-0000-0000-0000-000000000003', 'YOYAQ-002 inactive org', 'yoyaq-002-inactive', 'pro', FALSE, 'approved');

INSERT INTO public.stores (id, name, short_name, organization_id, status, display_order)
VALUES
  ('22000000-0000-0000-0000-000000000001', 'YOYAQ-002 store A1', '002-A1', '12000000-0000-0000-0000-000000000001', 'active', 1),
  ('22000000-0000-0000-0000-000000000002', 'YOYAQ-002 store A2', '002-A2', '12000000-0000-0000-0000-000000000001', 'active', 2),
  ('22000000-0000-0000-0000-000000000003', 'YOYAQ-002 inactive store', '002-A3', '12000000-0000-0000-0000-000000000001', 'inactive', 3),
  ('22000000-0000-0000-0000-000000000004', 'YOYAQ-002 store B', '002-B', '12000000-0000-0000-0000-000000000002', 'active', 1),
  ('22000000-0000-0000-0000-000000000005', 'YOYAQ-002 inactive org store', '002-C', '12000000-0000-0000-0000-000000000003', 'active', 1);

INSERT INTO public.reservation_settings (
  id,
  store_id,
  organization_id,
  cancellation_deadline_hours,
  cancellation_fees,
  cancellation_fee_basis,
  private_cancellation_deadline_hours,
  private_cancellation_fees,
  private_cancellation_fee_basis,
  policy_updated_at
)
VALUES
  (
    '32000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    0,
    '[{"hours_before":48,"fee_percentage":50,"description":"A1 open"}]'::jsonb,
    'participant_total',
    0,
    '[{"hours_before":168,"fee_percentage":50,"description":"A1 private"}]'::jsonb,
    'performance_total',
    '2026-07-19'
  ),
  (
    '32000000-0000-0000-0000-000000000004',
    '22000000-0000-0000-0000-000000000004',
    '12000000-0000-0000-0000-000000000002',
    999,
    '[{"hours_before":999,"fee_percentage":99,"description":"other tenant"}]'::jsonb,
    'performance_total',
    999,
    '[{"hours_before":999,"fee_percentage":99,"description":"other tenant"}]'::jsonb,
    'participant_total',
    '2026-07-18'
  );

DO $$
DECLARE
  v_count INTEGER;
  v_store_ids UUID[];
  v_policy RECORD;
BEGIN
  SELECT count(*), array_agg(store_id ORDER BY store_id)
  INTO v_count, v_store_ids
  FROM public.get_public_cancellation_policy('yoyaq-002-org-a', NULL);

  IF v_count IS DISTINCT FROM 2
    OR v_store_ids IS DISTINCT FROM ARRAY[
      '22000000-0000-0000-0000-000000000001'::UUID,
      '22000000-0000-0000-0000-000000000002'::UUID
    ] THEN
    RAISE EXCEPTION 'org Aのactive店舗が分離されて返りません: count=%, stores=%', v_count, v_store_ids;
  END IF;

  SELECT *
  INTO STRICT v_policy
  FROM public.get_public_cancellation_policy(
    'yoyaq-002-org-a',
    '22000000-0000-0000-0000-000000000001'
  );

  IF v_policy.organization_id IS DISTINCT FROM '12000000-0000-0000-0000-000000000001'::UUID
    OR v_policy.store_id IS DISTINCT FROM '22000000-0000-0000-0000-000000000001'::UUID
    OR v_policy.is_configured IS DISTINCT FROM TRUE
    OR v_policy.cancellation_fee_basis IS DISTINCT FROM 'participant_total'
    OR v_policy.private_cancellation_fee_basis IS DISTINCT FROM 'performance_total'
    OR v_policy.policy_updated_at IS DISTINCT FROM '2026-07-19'::DATE THEN
    RAISE EXCEPTION '明示storeの公開ポリシーが設定値と一致しません';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.get_public_cancellation_policy(
    'yoyaq-002-org-a',
    '22000000-0000-0000-0000-000000000004'
  );
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '他tenantのstore_idがorg Aへ混入しました';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.get_public_cancellation_policy(
    'yoyaq-002-org-a',
    '22000000-0000-0000-0000-000000000003'
  );
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'inactive店舗が公開されました';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.get_public_cancellation_policy('yoyaq-002-inactive', NULL);
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'inactive組織が公開されました';
  END IF;

  SELECT *
  INTO STRICT v_policy
  FROM public.get_public_cancellation_policy(
    'yoyaq-002-org-a',
    '22000000-0000-0000-0000-000000000002'
  );
  IF v_policy.is_configured IS DISTINCT FROM FALSE
    OR v_policy.cancellation_fees IS NOT NULL THEN
    RAISE EXCEPTION '未設定店舗に別店舗の設定または既定値が混入しました';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT has_function_privilege('anon', 'public.get_public_cancellation_policy(text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_public_cancellation_policy(text,uuid)', 'EXECUTE')
    OR EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.get_public_cancellation_policy(text,uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'RPC execute権限が最小公開設定ではありません';
  END IF;
END;
$$;

ROLLBACK;
