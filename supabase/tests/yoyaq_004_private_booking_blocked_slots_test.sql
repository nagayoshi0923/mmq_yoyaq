-- YOYAQ-004: 募集停止枠の貸切申請・承認ガード回帰テスト
-- migration適用済みの使い捨てlocal DB専用。staging/prodでは実行しない。
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.organizations (id, name, slug, plan, is_active)
VALUES
  ('14000000-0000-0000-0000-000000000001', 'YOYAQ-004 org A', 'yoyaq-004-org-a', 'pro', TRUE),
  ('14000000-0000-0000-0000-000000000002', 'YOYAQ-004 org B', 'yoyaq-004-org-b', 'pro', TRUE);

INSERT INTO public.stores (
  id, name, short_name, organization_id, status, display_order
)
VALUES
  ('24000000-0000-0000-0000-000000000001', 'YOYAQ-004 store A1', '004-A1', '14000000-0000-0000-0000-000000000001', 'active', 1),
  ('24000000-0000-0000-0000-000000000002', 'YOYAQ-004 store A2', '004-A2', '14000000-0000-0000-0000-000000000001', 'active', 2),
  ('24000000-0000-0000-0000-000000000003', 'YOYAQ-004 inactive A3', '004-A3', '14000000-0000-0000-0000-000000000001', 'inactive', 3),
  ('24000000-0000-0000-0000-000000000004', 'YOYAQ-004 store B1', '004-B1', '14000000-0000-0000-0000-000000000002', 'active', 1);

INSERT INTO public.scenario_masters (
  id, title, official_duration, master_status
)
VALUES (
  '34000000-0000-0000-0000-000000000001',
  'YOYAQ-004 scenario',
  240,
  'approved'
);

INSERT INTO public.organization_scenarios (
  id, organization_id, scenario_master_id, participation_fee, org_status
)
VALUES (
  '44000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  4000,
  'available'
);

INSERT INTO public.schedule_blocked_slots (
  organization_id, date, store_id, time_slot, created_at
)
VALUES
  (
    '14000000-0000-0000-0000-000000000001',
    '2027-01-10',
    '24000000-0000-0000-0000-000000000001',
    'afternoon',
    '2026-12-01 00:00:00+00'
  ),
  (
    '14000000-0000-0000-0000-000000000001',
    '2027-01-11',
    '24000000-0000-0000-0000-000000000001',
    'morning',
    '2026-12-01 00:00:00+00'
  ),
  (
    '14000000-0000-0000-0000-000000000001',
    '2027-01-11',
    '24000000-0000-0000-0000-000000000002',
    'morning',
    '2026-12-01 00:00:00+00'
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    '2027-01-10',
    '24000000-0000-0000-0000-000000000004',
    'afternoon',
    '2026-12-01 00:00:00+00'
  );

-- 一部店舗のみ停止: 未停止のA2が残るため申請は作成できる。
DO $$
DECLARE
  v_reservation_id UUID;
  v_payload JSONB := jsonb_build_object(
    'requestedStores', jsonb_build_array(
      jsonb_build_object('storeId', '24000000-0000-0000-0000-000000000001'),
      jsonb_build_object('storeId', '24000000-0000-0000-0000-000000000002')
    ),
    'candidates', jsonb_build_array(
      jsonb_build_object(
        'date', '2027-01-10',
        'startTime', '13:00',
        'endTime', '17:00',
        'timeSlot', '午後'
      )
    )
  );
BEGIN
  v_reservation_id := public.create_private_booking_request(
    '44000000-0000-0000-0000-000000000001',
    NULL,
    'fixture',
    'fixture@example.invalid',
    NULL,
    4,
    v_payload,
    NULL,
    'YOYAQ-004-PARTIAL',
    NULL
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.reservations
    WHERE id = v_reservation_id
      AND organization_id = '14000000-0000-0000-0000-000000000001'
      AND status = 'pending'
      AND candidate_datetimes = v_payload
  ) THEN
    RAISE EXCEPTION '一部店舗停止の申請が信頼済みtenant/candidateで保持されません';
  END IF;
END;
$$;

-- 申請後に残り店舗を停止しても、既存pending申請は変更・削除しない。
INSERT INTO public.schedule_blocked_slots (
  organization_id, date, store_id, time_slot, created_at
)
VALUES (
  '14000000-0000-0000-0000-000000000001',
  '2027-01-10',
  '24000000-0000-0000-0000-000000000002',
  'afternoon',
  clock_timestamp()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.reservations
    WHERE reservation_number = 'YOYAQ-004-PARTIAL'
      AND status = 'pending'
      AND candidate_datetimes->'candidates'->0->>'timeSlot' = '午後'
  ) THEN
    RAISE EXCEPTION '申請後の募集停止で既存pending申請が変更されました';
  END IF;
END;
$$;

-- 申請後に全希望店舗が停止したpending申請は、承認transactionでもP0040となり不変を保つ。
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
)
VALUES (
  '64000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'yoyaq-004-admin@example.invalid',
  '',
  clock_timestamp(),
  clock_timestamp(),
  clock_timestamp(),
  '',
  ''
);

INSERT INTO public.users (
  id, email, role, organization_id, created_at, updated_at
)
VALUES (
  '64000000-0000-0000-0000-000000000001',
  'yoyaq-004-admin@example.invalid',
  'admin',
  '14000000-0000-0000-0000-000000000001',
  clock_timestamp(),
  clock_timestamp()
);

INSERT INTO public.staff (
  id, name, role, status, organization_id, user_id
)
VALUES (
  '74000000-0000-0000-0000-000000000001',
  'YOYAQ-004 GM',
  ARRAY['staff'],
  'active',
  '14000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  '64000000-0000-0000-0000-000000000001',
  true
);

DO $$
DECLARE
  v_reservation RECORD;
  v_event_count INTEGER;
BEGIN
  SELECT *
  INTO STRICT v_reservation
  FROM public.reservations
  WHERE reservation_number = 'YOYAQ-004-PARTIAL';

  SELECT count(*) INTO v_event_count FROM public.schedule_events;

  BEGIN
    PERFORM public.approve_private_booking(
      v_reservation.id,
      '2027-01-10',
      '13:00',
      '17:00',
      '24000000-0000-0000-0000-000000000002',
      '74000000-0000-0000-0000-000000000001',
      v_reservation.candidate_datetimes,
      'YOYAQ-004 scenario',
      'fixture',
      NULL
    );
    RAISE EXCEPTION '募集停止後のpending申請が承認されました';
  EXCEPTION WHEN SQLSTATE 'P0040' THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.reservations
    WHERE id = v_reservation.id
      AND status = 'pending'
      AND schedule_event_id IS NULL
      AND candidate_datetimes = v_reservation.candidate_datetimes
  ) THEN
    RAISE EXCEPTION '募集停止承認エラーでpending申請が変更されました';
  END IF;

  IF (SELECT count(*) FROM public.schedule_events) IS DISTINCT FROM v_event_count THEN
    RAISE EXCEPTION '募集停止承認エラー前に公演mutationが発生しました';
  END IF;
END;
$$;

-- 全店舗停止: 日本語timeSlotをcanonical morningへ変換し、mutation前にP0040で拒否する。
DO $$
DECLARE
  v_before INTEGER;
BEGIN
  SELECT count(*) INTO v_before FROM public.reservations;
  BEGIN
    PERFORM public.create_private_booking_request(
      '44000000-0000-0000-0000-000000000001',
      NULL,
      'fixture',
      'fixture@example.invalid',
      NULL,
      4,
      '{
        "requestedStores": [
          {"storeId":"24000000-0000-0000-0000-000000000001"},
          {"storeId":"24000000-0000-0000-0000-000000000002"}
        ],
        "candidates": [
          {
            "date":"2027-01-11",
            "startTime":"10:00",
            "endTime":"14:00",
            "timeSlot":"午前"
          }
        ]
      }'::JSONB,
      NULL,
      'YOYAQ-004-ALL-BLOCKED',
      NULL
    );
    RAISE EXCEPTION '全店舗停止の申請が拒否されませんでした';
  EXCEPTION WHEN SQLSTATE 'P0040' THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.reservations) IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION '全店舗停止エラー前に予約mutationが発生しました';
  END IF;
END;
$$;

-- 他tenantのstore_idは信頼済みorganizationに属さないためP0042で拒否する。
DO $$
BEGIN
  BEGIN
    PERFORM public.create_private_booking_request(
      '44000000-0000-0000-0000-000000000001',
      NULL,
      'fixture',
      'fixture@example.invalid',
      NULL,
      4,
      '{
        "requestedStores": [
          {"storeId":"24000000-0000-0000-0000-000000000004"}
        ],
        "candidates": [
          {
            "date":"2027-01-12",
            "startTime":"18:00",
            "endTime":"22:00",
            "timeSlot":"evening"
          }
        ]
      }'::JSONB,
      NULL,
      'YOYAQ-004-OTHER-TENANT',
      NULL
    );
    RAISE EXCEPTION '他tenant店舗が申請に使用されました';
  EXCEPTION WHEN SQLSTATE 'P0042' THEN
    NULL;
  END;
END;
$$;

-- 公演競合は募集停止とは別のP0030を返す。
INSERT INTO public.schedule_events (
  id, date, venue, scenario, start_time, end_time, store_id,
  is_cancelled, category, organization_id
)
VALUES
  (
    '54000000-0000-0000-0000-000000000001',
    '2027-01-12',
    'A1',
    'existing',
    '12:30',
    '17:30',
    '24000000-0000-0000-0000-000000000001',
    FALSE,
    'open',
    '14000000-0000-0000-0000-000000000001'
  ),
  (
    '54000000-0000-0000-0000-000000000002',
    '2027-01-12',
    'A2',
    'existing',
    '12:30',
    '17:30',
    '24000000-0000-0000-0000-000000000002',
    FALSE,
    'open',
    '14000000-0000-0000-0000-000000000001'
  );

DO $$
BEGIN
  BEGIN
    PERFORM public.create_private_booking_request(
      '44000000-0000-0000-0000-000000000001',
      NULL,
      'fixture',
      'fixture@example.invalid',
      NULL,
      4,
      '{
        "requestedStores": [
          {"storeId":"24000000-0000-0000-0000-000000000001"},
          {"storeId":"24000000-0000-0000-0000-000000000002"}
        ],
        "candidates": [
          {
            "date":"2027-01-12",
            "startTime":"13:00",
            "endTime":"17:00",
            "timeSlot":"afternoon"
          }
        ]
      }'::JSONB,
      NULL,
      'YOYAQ-004-EVENT-CONFLICT',
      NULL
    );
    RAISE EXCEPTION '公演競合の申請が拒否されませんでした';
  EXCEPTION WHEN SQLSTATE 'P0030' THEN
    NULL;
  END;
END;
$$;

-- 公開RPCは指定tenant・active store・期間の最小3列だけを返す。
DO $$
DECLARE
  v_count INTEGER;
  v_row RECORD;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.get_public_private_booking_availability(
    '14000000-0000-0000-0000-000000000001',
    ARRAY[
      '24000000-0000-0000-0000-000000000001'::UUID,
      '24000000-0000-0000-0000-000000000003'::UUID,
      '24000000-0000-0000-0000-000000000004'::UUID
    ],
    '2027-01-10',
    '2027-01-10'
  );
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '公開RPCのtenant/active store境界が不正です: %', v_count;
  END IF;

  SELECT * INTO STRICT v_row
  FROM public.get_public_private_booking_availability(
    '14000000-0000-0000-0000-000000000001',
    ARRAY['24000000-0000-0000-0000-000000000001'::UUID],
    '2027-01-10',
    '2027-01-10'
  );
  IF v_row.date IS DISTINCT FROM '2027-01-10'::DATE
    OR v_row.store_id IS DISTINCT FROM '24000000-0000-0000-0000-000000000001'::UUID
    OR v_row.time_slot IS DISTINCT FROM 'afternoon' THEN
    RAISE EXCEPTION '公開RPCの最小availability値が不正です';
  END IF;
END;
$$;

-- transaction race対策・承認時のtrusted candidate/store/date/time_slot再検査を定義上も固定する。
DO $$
DECLARE
  v_create_def TEXT := pg_get_functiondef(
    'public.create_private_booking_request(uuid,uuid,text,text,text,integer,jsonb,text,text,uuid)'::regprocedure
  );
  v_approve_def TEXT := pg_get_functiondef(
    'public.approve_private_booking(uuid,date,time without time zone,time without time zone,uuid,uuid,jsonb,text,text,uuid)'::regprocedure
  );
BEGIN
  IF position('LOCK TABLE schedule_blocked_slots IN SHARE MODE' IN v_create_def) = 0
    OR position('LOCK TABLE schedule_events IN SHARE MODE' IN v_create_def) = 0
    OR position('blocked.organization_id = v_org_id' IN v_create_def) = 0
    OR position('event.organization_id = v_org_id' IN v_create_def) = 0
    OR position('v_blocked_store_count = v_requested_store_count' IN v_create_def) = 0 THEN
    RAISE EXCEPTION '申請RPCのtransaction/tenant/all-store guardが欠落しています';
  END IF;

  IF position('FROM reservations' IN v_approve_def) = 0
    OR position('FOR UPDATE' IN v_approve_def) = 0
    OR position('v_reservation.candidate_datetimes' IN v_approve_def) = 0
    OR position('v_candidate_end_time = p_selected_end_time' IN v_approve_def) = 0
    OR position('requested->>''storeId'' = p_selected_store_id::TEXT' IN v_approve_def) = 0
    OR position('LOCK TABLE schedule_blocked_slots IN SHARE MODE' IN v_approve_def) = 0
    OR position('LOCK TABLE schedule_events IN SHARE ROW EXCLUSIVE MODE' IN v_approve_def) = 0
    OR position('blocked.organization_id = v_org_id' IN v_approve_def) = 0
    OR position('PRIVATE_BOOKING_SLOT_BLOCKED' IN v_approve_def) = 0
    OR position('WHERE organization_id = v_org_id' IN v_approve_def) = 0 THEN
    RAISE EXCEPTION '承認RPCのtrusted candidate/store/transaction/tenant guardが欠落しています';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT has_function_privilege(
      'anon',
      'public.get_public_private_booking_availability(uuid,uuid[],date,date)',
      'EXECUTE'
    )
    OR NOT has_function_privilege(
      'authenticated',
      'public.get_public_private_booking_availability(uuid,uuid[],date,date)',
      'EXECUTE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.get_public_private_booking_availability(uuid,uuid[],date,date)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) THEN
    RAISE EXCEPTION '公開availability RPCのexecute権限が最小設定ではありません';
  END IF;
END;
$$;

ROLLBACK;
