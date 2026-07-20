-- YOYAQ-001: キャンセルポリシーsnapshotのtenant境界テスト
-- migration適用済みの使い捨てlocal DB専用。staging/prodでは実行しない。
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'YOYAQ-001 org A', 'yoyaq-001-org-a'),
  ('10000000-0000-0000-0000-000000000002', 'YOYAQ-001 org B', 'yoyaq-001-org-b');

INSERT INTO public.stores (id, name, short_name, organization_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'YOYAQ-001 store A', '001-A', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'YOYAQ-001 store B', '001-B', '10000000-0000-0000-0000-000000000002');

-- 他tenant側にはdefaultと異なる設定を置き、org Aの予約から参照されないことを固定する。
INSERT INTO public.reservation_settings (
  id,
  store_id,
  organization_id,
  cancellation_deadline_hours,
  cancellation_fees,
  cancellation_fee_basis
)
VALUES (
  '30000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  999,
  '[{"hours_before":999,"fee_percentage":99,"description":"other tenant"}]'::jsonb,
  'performance_total'
);

-- org A予約へorg B storeを渡したINSERTは、default固定へ逃がさず必ず拒否する。
DO $$
DECLARE
  v_rejected BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO public.reservations (
      id,
      title,
      store_id,
      requested_datetime,
      duration,
      organization_id
    ) VALUES (
      '40000000-0000-0000-0000-000000000001',
      'YOYAQ-001 tenant mismatch',
      '20000000-0000-0000-0000-000000000002',
      '2026-08-08T10:00:00+09:00',
      180,
      '10000000-0000-0000-0000-000000000001'
    );
  EXCEPTION
    WHEN check_violation THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'tenant不整合のstore_idが拒否されませんでした';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.reservations
    WHERE id = '40000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION '拒否対象の予約が保存されています';
  END IF;
END;
$$;

-- 同一tenantのstore Aには設定行を作らず、不変defaultが完全snapshotとして保存されることを確認する。
INSERT INTO public.reservations (
  id,
  title,
  store_id,
  requested_datetime,
  duration,
  organization_id
) VALUES (
  '40000000-0000-0000-0000-000000000002',
  'YOYAQ-001 same tenant default',
  '20000000-0000-0000-0000-000000000001',
  '2026-08-08T10:00:00+09:00',
  180,
  '10000000-0000-0000-0000-000000000001'
);

DO $$
DECLARE
  v_snapshot public.reservations%ROWTYPE;
  v_store_organization_id UUID;
BEGIN
  SELECT *
  INTO STRICT v_snapshot
  FROM public.reservations
  WHERE id = '40000000-0000-0000-0000-000000000002';

  SELECT organization_id
  INTO STRICT v_store_organization_id
  FROM public.stores
  WHERE id = v_snapshot.cancellation_policy_store_id;

  IF v_snapshot.cancellation_policy_snapshot_version IS DISTINCT FROM 1
    OR v_snapshot.cancellation_policy_store_id IS DISTINCT FROM '20000000-0000-0000-0000-000000000001'::uuid
    OR v_store_organization_id IS DISTINCT FROM v_snapshot.organization_id
    OR v_snapshot.cancellation_policy_performance_type IS DISTINCT FROM 'open'
    OR v_snapshot.cancellation_policy_deadline_hours IS NULL
    OR v_snapshot.cancellation_policy_fees IS NULL
    OR v_snapshot.cancellation_policy_fee_basis IS NULL
    OR v_snapshot.cancellation_policy_updated_at IS NULL THEN
    RAISE EXCEPTION '同一tenant・設定なし予約のsnapshotが不完全です';
  END IF;

  IF v_snapshot.cancellation_policy_deadline_hours IS DISTINCT FROM 0
    OR v_snapshot.cancellation_policy_fee_basis IS DISTINCT FROM 'participant_total'
    OR v_snapshot.cancellation_policy_fees IS DISTINCT FROM
      '[{"hours_before":48,"fee_percentage":50,"description":"前日より50%"},{"hours_before":24,"fee_percentage":100,"description":"当日より100%"},{"hours_before":-1,"fee_percentage":100,"description":"公演開始後・無断100%"}]'::jsonb THEN
    RAISE EXCEPTION '同一tenant・設定なし予約に不変defaultが保存されていません';
  END IF;
END;
$$;

-- 完全snapshotを基準に、store/orgのtenant不整合UPDATEが23514で拒否され、
-- 失敗後も予約本体とsnapshotが変化しないことを確認する。
CREATE TEMP TABLE _yoyaq001_snapshot_before ON COMMIT DROP AS
SELECT
  id,
  store_id,
  organization_id,
  to_jsonb(r) AS reservation,
  jsonb_build_object(
    'version', cancellation_policy_snapshot_version,
    'store_id', cancellation_policy_store_id,
    'performance_type', cancellation_policy_performance_type,
    'deadline_hours', cancellation_policy_deadline_hours,
    'fees', cancellation_policy_fees,
    'fee_basis', cancellation_policy_fee_basis,
    'updated_at', cancellation_policy_updated_at
  ) AS snapshot
FROM public.reservations r
WHERE id = '40000000-0000-0000-0000-000000000002';

DO $$
DECLARE
  v_rejected BOOLEAN := false;
  v_before RECORD;
  v_after RECORD;
BEGIN
  SELECT *
  INTO STRICT v_before
  FROM _yoyaq001_snapshot_before;

  -- (1) store_idを同一tenant店舗から他tenant店舗へ変更する経路。
  BEGIN
    UPDATE public.reservations
    SET store_id = '20000000-0000-0000-0000-000000000002'
    WHERE id = v_before.id;
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION '他tenant storeへのUPDATEがSQLSTATE 23514で拒否されませんでした';
  END IF;

  SELECT
    r.store_id,
    r.organization_id,
    to_jsonb(r) AS reservation,
    jsonb_build_object(
      'version', r.cancellation_policy_snapshot_version,
      'store_id', r.cancellation_policy_store_id,
      'performance_type', r.cancellation_policy_performance_type,
      'deadline_hours', r.cancellation_policy_deadline_hours,
      'fees', r.cancellation_policy_fees,
      'fee_basis', r.cancellation_policy_fee_basis,
      'updated_at', r.cancellation_policy_updated_at
    ) AS snapshot
  INTO STRICT v_after
  FROM public.reservations r
  WHERE r.id = v_before.id;

  IF v_after.store_id IS DISTINCT FROM v_before.store_id
    OR v_after.organization_id IS DISTINCT FROM v_before.organization_id
    OR v_after.reservation IS DISTINCT FROM v_before.reservation
    OR v_after.snapshot IS DISTINCT FROM v_before.snapshot THEN
    RAISE EXCEPTION '他tenant storeへの失敗UPDATE後に予約またはsnapshotが変化しました';
  END IF;

  -- (2) organization_idだけを変更し、既存storeと不整合にする経路。
  v_rejected := false;
  BEGIN
    UPDATE public.reservations
    SET organization_id = '10000000-0000-0000-0000-000000000002'
    WHERE id = v_before.id;
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION '他tenant organizationへのUPDATEがSQLSTATE 23514で拒否されませんでした';
  END IF;

  SELECT
    r.store_id,
    r.organization_id,
    to_jsonb(r) AS reservation,
    jsonb_build_object(
      'version', r.cancellation_policy_snapshot_version,
      'store_id', r.cancellation_policy_store_id,
      'performance_type', r.cancellation_policy_performance_type,
      'deadline_hours', r.cancellation_policy_deadline_hours,
      'fees', r.cancellation_policy_fees,
      'fee_basis', r.cancellation_policy_fee_basis,
      'updated_at', r.cancellation_policy_updated_at
    ) AS snapshot
  INTO STRICT v_after
  FROM public.reservations r
  WHERE r.id = v_before.id;

  IF v_after.store_id IS DISTINCT FROM v_before.store_id
    OR v_after.organization_id IS DISTINCT FROM v_before.organization_id
    OR v_after.reservation IS DISTINCT FROM v_before.reservation
    OR v_after.snapshot IS DISTINCT FROM v_before.snapshot THEN
    RAISE EXCEPTION '他tenant organizationへの失敗UPDATE後に予約またはsnapshotが変化しました';
  END IF;
END;
$$;

-- (3) migration以前の予約を再現するため、INSERT snapshot triggerだけをtransaction内で無効化する。
ALTER TABLE public.reservations
  DISABLE TRIGGER set_reservation_cancellation_policy_snapshot_on_insert;

INSERT INTO public.reservations (
  id,
  title,
  store_id,
  requested_datetime,
  duration,
  organization_id
) VALUES (
  '40000000-0000-0000-0000-000000000003',
  'YOYAQ-001 legacy before unrelated update',
  '20000000-0000-0000-0000-000000000001',
  '2026-08-08T10:00:00+09:00',
  180,
  '10000000-0000-0000-0000-000000000001'
);

ALTER TABLE public.reservations
  ENABLE TRIGGER set_reservation_cancellation_policy_snapshot_on_insert;

DO $$
DECLARE
  v_updated_rows INTEGER;
  v_before_snapshot JSONB;
  v_after_snapshot JSONB;
  v_after_title TEXT;
BEGIN
  SELECT jsonb_build_object(
    'version', cancellation_policy_snapshot_version,
    'store_id', cancellation_policy_store_id,
    'performance_type', cancellation_policy_performance_type,
    'deadline_hours', cancellation_policy_deadline_hours,
    'fees', cancellation_policy_fees,
    'fee_basis', cancellation_policy_fee_basis,
    'updated_at', cancellation_policy_updated_at
  )
  INTO STRICT v_before_snapshot
  FROM public.reservations
  WHERE id = '40000000-0000-0000-0000-000000000003';

  IF v_before_snapshot IS DISTINCT FROM jsonb_build_object(
    'version', NULL,
    'store_id', NULL,
    'performance_type', NULL,
    'deadline_hours', NULL,
    'fees', NULL,
    'fee_basis', NULL,
    'updated_at', NULL
  ) THEN
    RAISE EXCEPTION 'migration以前の予約がNULL snapshotとして再現されていません';
  END IF;

  UPDATE public.reservations
  SET title = 'YOYAQ-001 legacy after unrelated update'
  WHERE id = '40000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'migration以前の予約に対する無関係UPDATEが成功しませんでした';
  END IF;

  SELECT
    title,
    jsonb_build_object(
      'version', cancellation_policy_snapshot_version,
      'store_id', cancellation_policy_store_id,
      'performance_type', cancellation_policy_performance_type,
      'deadline_hours', cancellation_policy_deadline_hours,
      'fees', cancellation_policy_fees,
      'fee_basis', cancellation_policy_fee_basis,
      'updated_at', cancellation_policy_updated_at
    )
  INTO STRICT v_after_title, v_after_snapshot
  FROM public.reservations
  WHERE id = '40000000-0000-0000-0000-000000000003';

  IF v_after_title IS DISTINCT FROM 'YOYAQ-001 legacy after unrelated update'
    OR v_after_snapshot IS DISTINCT FROM v_before_snapshot THEN
    RAISE EXCEPTION 'migration以前の予約の無関係UPDATEでsnapshotが変化しました';
  END IF;
END;
$$;

ROLLBACK;
