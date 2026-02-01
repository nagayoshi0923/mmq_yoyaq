-- =============================================================================
-- RECOVER TS-0: 参加者（デモ / 手動追加）の復元（現仕様に整合）
-- =============================================================================
--
-- 目的:
-- - 過去に「デモ参加者」「参加者を追加」等で入っていた参加者が消え、
--   予約一覧/予約者タブが空になる問題を復元する。
--
-- 前提（現仕様）:
-- - 予約が存在する公演: reservations（active: pending/confirmed/gm_confirmed）が single source of truth
-- - 予約が 0 件の公演: schedule_events.current_participants（手動満席など）を残す
--
-- このSQLがやること:
-- (A) reservations_history から「削除された予約」を探し、復元（可能な範囲で元データを復元）
-- (B) それでも「予約が0件だが current_participants>0」の公演については、
--     current_participants を“予約”として可視化するための復元用予約（reservation_source='manual_restore'）を作る
--
-- 安全設計:
-- - (A) は id を元の UUID で復元し、既に存在する場合はスキップ
-- - (B) は reservation_source='manual_restore' で挿入するので、後で一括削除可能
--
-- 実行方法:
-- 1) まず「プレビュー（SELECT）」だけを実行して件数と内容を確認
-- 2) 問題なければ「復元（INSERT）」を実行
--
-- パラメータ（任意）:
--   SELECT set_config('app.recover_org_id', 'a0000000-0000-0000-0000-000000000001', false);
--   SELECT set_config('app.recover_since', '2025-01-01', false); -- 履歴の検索開始日
--   SELECT set_config('app.recover_until', '2026-12-31', false); -- 履歴の検索終了日
-- ※ 置換が面倒な場合は set_config を省略してOK（現在のログイン組織 or QW 固定IDで自動検出します）
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) まず「実体があるか」診断（置換なしで自動検出）
-- -----------------------------------------------------------------------------
-- (0-A) action_type の分布（履歴が入っているか）
-- SELECT action_type, count(*) FROM public.reservations_history GROUP BY action_type ORDER BY count(*) DESC;
-- SELECT action_type, count(*) FROM public.schedule_event_history GROUP BY action_type ORDER BY count(*) DESC;
--
-- (0-B) UIで「予約はありません」になりがちな原因:
--   schedule_events の organization_id と、紐付く reservations の organization_id がズレている
--   → 組織フィルタで reservations が見えなくなる
--
-- 置換不要で「ズレ」を自動検出（プレビュー）
WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id
),
mismatched AS (
  SELECT
    r.id AS reservation_id,
    r.schedule_event_id,
    r.organization_id AS reservation_org_id,
    se.organization_id AS event_org_id,
    se.date,
    se.start_time,
    se.scenario,
    r.status,
    r.reservation_source,
    r.participant_count,
    r.customer_id,
    COALESCE(r.customer_name, r.customer_notes, '') AS name_or_notes
  FROM public.reservations r
  JOIN public.schedule_events se ON se.id = r.schedule_event_id
  JOIN params p ON p.org_id = se.organization_id
  WHERE r.organization_id IS DISTINCT FROM se.organization_id
    -- 復元対象になりやすい「手動追加」系のみ（安全側）
    AND (
      r.customer_id IS NULL
      OR r.reservation_source IN ('demo', 'demo_auto', 'walk_in', 'staff_participation', 'staff_entry', 'manual_restore')
    )
)
SELECT
  '0B_org_mismatch_preview' AS section,
  *
FROM mismatched
ORDER BY date DESC, start_time DESC
LIMIT 200;

-- (0-C) (0-B) の修復（適用）
-- 置換不要。まずは (0-B) の結果が出ることを確認してから実行。
-- WITH params AS (
--   SELECT
--     COALESCE(
--       NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
--       get_user_organization_id(),
--       'a0000000-0000-0000-0000-000000000001'::uuid
--     ) AS org_id
-- ),
-- mismatched AS (
--   SELECT
--     r.id AS reservation_id,
--     se.organization_id AS event_org_id
--   FROM public.reservations r
--   JOIN public.schedule_events se ON se.id = r.schedule_event_id
--   JOIN params p ON p.org_id = se.organization_id
--   WHERE r.organization_id IS DISTINCT FROM se.organization_id
--     AND (
--       r.customer_id IS NULL
--       OR r.reservation_source IN ('demo', 'demo_auto', 'walk_in', 'staff_participation', 'staff_entry', 'manual_restore')
--     )
-- )
-- UPDATE public.reservations r
-- SET organization_id = m.event_org_id
-- FROM mismatched m
-- WHERE r.id = m.reservation_id;

-- -----------------------------------------------------------------------------
-- 0) パラメータ
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id,
    COALESCE(NULLIF(current_setting('app.recover_since', true), ''), (now() - interval '180 days')::date::text)::date AS since_date,
    COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date
),

-- -----------------------------------------------------------------------------
-- (A-1) 削除履歴の抽出（候補）
-- -----------------------------------------------------------------------------
deleted_candidates AS (
  SELECT
    h.created_at AS deleted_at,
    h.changed_by_role,
    h.changed_by_user_id,
    h.changed_by_staff_id,
    h.old_values AS old
  FROM public.reservations_history h
  JOIN params p ON p.org_id = h.organization_id
  WHERE
    h.action_type = 'delete'
    AND h.created_at::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
    AND (h.old_values ? 'id')
    AND COALESCE(h.old_values->>'schedule_event_id', '') <> ''
    AND COALESCE(h.old_values->>'reservation_source', '') IN (
      'demo', 'demo_auto',
      'walk_in',
      'staff_participation', 'staff_entry'
    )
),

deleted_preview AS (
  SELECT
    (old->>'id')::uuid AS reservation_id,
    (old->>'schedule_event_id')::uuid AS schedule_event_id,
    old->>'reservation_source' AS reservation_source,
    old->>'status' AS status,
    COALESCE((old->>'participant_count')::int, 0) AS participant_count,
    COALESCE(old->>'customer_name', old->>'customer_notes', '') AS name_or_notes,
    deleted_at,
    changed_by_role
  FROM deleted_candidates
)

-- -----------------------------------------------------------------------------
-- (A-Preview) 復元候補の表示（まずはここだけ実行推奨）
-- -----------------------------------------------------------------------------
SELECT
  'A_deleted_reservations' AS section,
  reservation_id,
  schedule_event_id,
  reservation_source,
  status,
  participant_count,
  name_or_notes,
  deleted_at,
  changed_by_role
FROM deleted_preview
ORDER BY deleted_at DESC
LIMIT 200;

-- =============================================================================
-- (A-Apply) 削除された予約の復元（必要な場合に実行）
-- =============================================================================
-- WITH params AS (
--   SELECT
--     COALESCE(
--       NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
--       get_user_organization_id(),
--       'a0000000-0000-0000-0000-000000000001'::uuid
--     ) AS org_id,
--     COALESCE(NULLIF(current_setting('app.recover_since', true), ''), (now() - interval '180 days')::date::text)::date AS since_date,
--     COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date
-- ),
-- deleted_candidates AS (
--   SELECT h.old_values AS old
--   FROM public.reservations_history h
--   JOIN params p ON p.org_id = h.organization_id
--   WHERE
--     h.action_type = 'delete'
--     AND h.created_at::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
--     AND (h.old_values ? 'id')
--     AND COALESCE(h.old_values->>'schedule_event_id', '') <> ''
--     AND COALESCE(h.old_values->>'reservation_source', '') IN (
--       'demo', 'demo_auto',
--       'walk_in',
--       'staff_participation', 'staff_entry'
--     )
-- ),
-- patched AS (
--   SELECT
--     -- 新しい NOT NULL 列が増えていても落ちにくいように、最低限の値を補う
--     jsonb_set(
--       jsonb_set(
--         jsonb_set(
--           jsonb_set(old, '{organization_id}', to_jsonb((SELECT org_id FROM params)), true),
--           '{status}', to_jsonb(COALESCE(old->>'status', 'confirmed')), true
--         ),
--         '{payment_method}', to_jsonb(COALESCE(old->>'payment_method', 'onsite')), true
--       ),
--       '{payment_status}', to_jsonb(COALESCE(old->>'payment_status', 'paid')), true
--     ) AS old2
--   FROM deleted_candidates
-- )
-- INSERT INTO public.reservations
-- SELECT (jsonb_populate_record(NULL::public.reservations, old2)).*
-- FROM patched
-- WHERE NOT EXISTS (
--   SELECT 1
--   FROM public.reservations r
--   WHERE r.id = (old2->>'id')::uuid
-- )
-- ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- (B) 手動満席/手動入力を「予約」として復元（予約が0件の公演のみ）
-- =============================================================================
-- 目的: 「予約はありません」なのに人数が入っている公演を、予約として可視化する。
-- ※ 復元予約は reservation_source='manual_restore' なので後で消せる。
--
-- プレビュー:
-- WITH params AS (
--   SELECT
--     COALESCE(
--       NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
--       get_user_organization_id(),
--       'a0000000-0000-0000-0000-000000000001'::uuid
--     ) AS org_id
-- )
-- SELECT
--   'B_events_without_reservations' AS section,
--   se.id AS schedule_event_id,
--   se.date,
--   se.start_time,
--   se.scenario,
--   se.current_participants,
--   COALESCE(sc.player_count_max, se.max_participants, se.capacity, 8) AS max_participants
-- FROM public.schedule_events se
-- LEFT JOIN public.scenarios sc ON sc.id = se.scenario_id
-- JOIN params p ON p.org_id = se.organization_id
-- WHERE
--   COALESCE(se.current_participants, 0) > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM public.reservations r
--     WHERE r.schedule_event_id = se.id
--   )
-- ORDER BY se.date DESC, se.start_time DESC
-- LIMIT 200;
--
-- 適用:
-- WITH params AS (
--   SELECT
--     COALESCE(
--       NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
--       get_user_organization_id(),
--       'a0000000-0000-0000-0000-000000000001'::uuid
--     ) AS org_id
-- ),
-- targets AS (
--   SELECT
--     se.*,
--     COALESCE(sc.player_count_max, se.max_participants, se.capacity, 8) AS max_participants
--   FROM public.schedule_events se
--   LEFT JOIN public.scenarios sc ON sc.id = se.scenario_id
--   JOIN params p ON p.org_id = se.organization_id
--   WHERE
--     COALESCE(se.current_participants, 0) > 0
--     AND NOT EXISTS (
--       SELECT 1 FROM public.reservations r
--       WHERE r.schedule_event_id = se.id
--     )
-- ),
-- ins AS (
--   SELECT
--     gen_random_uuid() AS id,
--     t.organization_id,
--     (to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4))) AS reservation_number,
--     COALESCE((t.scenarios->>'title')::text, t.scenario, '') AS title,
--     t.scenario_id,
--     t.store_id,
--     NULL::uuid AS customer_id,
--     NULL::uuid AS created_by,
--     t.id AS schedule_event_id,
--     (t.date + t.start_time)::timestamptz AS requested_datetime,
--     COALESCE(t.duration, 0) AS duration,
--     LEAST(COALESCE(t.current_participants, 0), t.max_participants)::int AS participant_count,
--     ARRAY[]::text[] AS participant_names,
--     0::int AS base_price,
--     0::int AS options_price,
--     0::int AS total_price,
--     0::int AS discount_amount,
--     0::int AS final_price,
--     0::int AS unit_price,
--     'onsite'::text AS payment_method,
--     'paid'::text AS payment_status,
--     'confirmed'::text AS status,
--     '（手動復元）予約なしの人数を復元'::text AS customer_notes,
--     'manual_restore'::text AS reservation_source,
--     now() AS created_at,
--     now() AS updated_at
--   FROM targets t
-- )
-- INSERT INTO public.reservations (
--   id, organization_id, reservation_number, title, scenario_id, store_id, customer_id, created_by,
--   schedule_event_id, requested_datetime, duration, participant_count, participant_names,
--   base_price, options_price, total_price, discount_amount, final_price, unit_price,
--   payment_method, payment_status, status, customer_notes, reservation_source, created_at, updated_at
-- )
-- SELECT
--   id, organization_id, reservation_number, title, scenario_id, store_id, customer_id, created_by,
--   schedule_event_id, requested_datetime, duration, participant_count, participant_names,
--   base_price, options_price, total_price, discount_amount, final_price, unit_price,
--   payment_method, payment_status, status, customer_notes, reservation_source, created_at, updated_at
-- FROM ins
-- ON CONFLICT (id) DO NOTHING;

