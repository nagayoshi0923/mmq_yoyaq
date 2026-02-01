-- =============================================================================
-- RECOVER TS-2: 参加者が「消えた」調査 + 自動復元（置換不要・全部コピペOK）
-- =============================================================================
--
-- これは「全部実行」してOKです（デフォルトは Preview のみで更新しません）
--
-- 使い方:
-- 1) まずはこのファイルをそのまま実行（Preview）
-- 2) Preview の結果が納得できたら、同じSQL Editorで下を実行してからもう一度このファイルを実行:
--      SELECT set_config('app.do_apply', 'true', false);
--
-- 任意パラメータ（置換不要）:
--   SELECT set_config('app.recover_org_id', 'a0000000-0000-0000-0000-000000000001', false);
--   SELECT set_config('app.recover_since', '2024-01-01', false);
--   SELECT set_config('app.recover_until', '2026-12-31', false);
--
-- =============================================================================

WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id,
    COALESCE(NULLIF(current_setting('app.recover_since', true), ''), '2024-01-01')::date AS since_date,
    COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date,
    (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
demo_customers AS (
  SELECT id
  FROM public.customers
  WHERE (name ILIKE '%デモ%' OR email ILIKE '%demo%' OR name ILIKE '%test%')
  LIMIT 50
),

-- -----------------------------------------------------------------------------
-- 1) 現状の「不整合イベント」を抽出（人数があるのに予約が無い）
-- -----------------------------------------------------------------------------
event_gaps AS (
  SELECT
    se.id AS schedule_event_id,
    se.organization_id,
    se.date,
    se.start_time,
    se.scenario,
    se.scenario_id,
    se.store_id,
    COALESCE(se.current_participants, 0) AS current_participants,
    COALESCE(sc.player_count_max, se.max_participants, se.capacity, 8) AS max_participants,
    COALESCE(SUM(CASE WHEN r.status IN ('pending','confirmed','gm_confirmed') THEN r.participant_count ELSE 0 END), 0) AS active_participants,
    COUNT(r.id) AS reservations_any_status
  FROM public.schedule_events se
  JOIN params p ON p.org_id = se.organization_id
  LEFT JOIN public.scenarios sc ON sc.id = se.scenario_id
  LEFT JOIN public.reservations r ON r.schedule_event_id = se.id
  WHERE se.date::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
  GROUP BY se.id, se.organization_id, se.date, se.start_time, se.scenario, se.scenario_id, se.store_id, se.current_participants, sc.player_count_max, se.max_participants, se.capacity
),
events_with_participants_but_no_reservations AS (
  SELECT *
  FROM event_gaps
  WHERE current_participants > 0 AND reservations_any_status = 0
),

-- -----------------------------------------------------------------------------
-- 2) 「孤児予約」(schedule_event_id IS NULL) を抽出して公演に紐付け候補を作る
-- -----------------------------------------------------------------------------
orphans AS (
  SELECT
    r.id AS reservation_id,
    r.organization_id AS reservation_org_id,
    r.reservation_source,
    r.status,
    r.title,
    r.scenario_id,
    r.store_id,
    r.customer_id,
    r.customer_name,
    r.customer_notes,
    r.participant_count,
    r.participant_names,
    r.requested_datetime,
    (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date AS req_date_jst,
    (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::time AS req_time_jst
  FROM public.reservations r
  JOIN params p ON p.org_id = r.organization_id
  WHERE
    r.schedule_event_id IS NULL
    AND (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
    AND (
      r.customer_id IS NULL
      OR r.customer_id IN (SELECT id FROM demo_customers)
      OR r.reservation_source IN ('demo','demo_auto','walk_in','staff_participation','staff_entry','manual_restore')
      OR COALESCE(r.customer_notes,'') ILIKE '%デモ%'
    )
),
matched AS (
  SELECT
    o.*,
    se.id AS schedule_event_id,
    se.date AS event_date,
    se.start_time AS event_start_time,
    se.scenario AS event_scenario,
    se.scenario_id AS event_scenario_id,
    se.store_id AS event_store_id,
    ABS(EXTRACT(EPOCH FROM (se.start_time::time - o.req_time_jst))) AS time_diff_seconds,
    (CASE WHEN o.store_id IS NOT NULL AND o.store_id = se.store_id THEN 3 ELSE 0 END) +
    (CASE WHEN o.scenario_id IS NOT NULL AND o.scenario_id = se.scenario_id THEN 3 ELSE 0 END) +
    (CASE WHEN o.title IS NOT NULL AND o.title <> '' AND o.title = se.scenario THEN 1 ELSE 0 END) AS match_score
  FROM orphans o
  JOIN public.schedule_events se
    ON se.organization_id = (SELECT org_id FROM params)
   AND se.date = o.req_date_jst
   AND ABS(EXTRACT(EPOCH FROM (se.start_time::time - o.req_time_jst))) <= 900 -- 15分以内
),
ranked AS (
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.reservation_id
      ORDER BY m.match_score DESC, m.time_diff_seconds ASC, m.schedule_event_id
    ) AS rn
  FROM matched m
)

-- -----------------------------------------------------------------------------
-- Preview 出力（ここまでが “確認”）
-- -----------------------------------------------------------------------------
SELECT
  'S1_events_with_participants_but_no_reservations' AS section,
  schedule_event_id,
  date,
  start_time,
  scenario,
  current_participants,
  max_participants
FROM events_with_participants_but_no_reservations
ORDER BY date DESC, start_time DESC
LIMIT 200;

SELECT
  'S2_orphan_reservations_match_preview' AS section,
  reservation_id,
  reservation_source,
  status,
  participant_count,
  COALESCE(customer_name, customer_notes, '') AS name_or_notes,
  requested_datetime,
  schedule_event_id,
  event_date,
  event_start_time,
  event_scenario,
  match_score,
  time_diff_seconds
FROM ranked
WHERE rn = 1
ORDER BY requested_datetime DESC
LIMIT 200;

-- =============================================================================
-- Apply（app.do_apply=true のときだけ実際に更新/挿入）
-- =============================================================================

-- (A) 孤児予約を公演に再紐付け（安全側の条件のみ）
WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id,
    COALESCE(NULLIF(current_setting('app.recover_since', true), ''), '2024-01-01')::date AS since_date,
    COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date,
    (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
demo_customers AS (
  SELECT id
  FROM public.customers
  WHERE (name ILIKE '%デモ%' OR email ILIKE '%demo%' OR name ILIKE '%test%')
  LIMIT 50
),
orphans AS (
  SELECT
    r.id AS reservation_id,
    r.organization_id AS reservation_org_id,
    r.reservation_source,
    r.status,
    r.title,
    r.scenario_id,
    r.store_id,
    r.customer_id,
    r.customer_notes,
    r.customer_name,
    r.participant_count,
    r.requested_datetime,
    (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date AS req_date_jst,
    (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::time AS req_time_jst
  FROM public.reservations r
  JOIN params p ON p.org_id = r.organization_id
  WHERE
    r.schedule_event_id IS NULL
    AND (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
    AND (
      r.customer_id IS NULL
      OR r.customer_id IN (SELECT id FROM demo_customers)
      OR r.reservation_source IN ('demo','demo_auto','walk_in','staff_participation','staff_entry','manual_restore')
      OR COALESCE(r.customer_notes,'') ILIKE '%デモ%'
    )
),
matched AS (
  SELECT
    o.reservation_id,
    se.id AS schedule_event_id,
    ABS(EXTRACT(EPOCH FROM (se.start_time::time - o.req_time_jst))) AS time_diff_seconds,
    (CASE WHEN o.store_id IS NOT NULL AND o.store_id = se.store_id THEN 3 ELSE 0 END) +
    (CASE WHEN o.scenario_id IS NOT NULL AND o.scenario_id = se.scenario_id THEN 3 ELSE 0 END) +
    (CASE WHEN o.title IS NOT NULL AND o.title <> '' AND o.title = se.scenario THEN 1 ELSE 0 END) AS match_score
  FROM orphans o
  JOIN public.schedule_events se
    ON se.organization_id = (SELECT org_id FROM params)
   AND se.date = o.req_date_jst
   AND ABS(EXTRACT(EPOCH FROM (se.start_time::time - o.req_time_jst))) <= 900
),
ranked AS (
  SELECT
    m.*,
    row_number() OVER (
      PARTITION BY m.reservation_id
      ORDER BY m.match_score DESC, m.time_diff_seconds ASC, m.schedule_event_id
    ) AS rn
  FROM matched m
),
updated AS (
  UPDATE public.reservations r
  SET schedule_event_id = rk.schedule_event_id
  FROM ranked rk, params p
  WHERE p.do_apply = true
    AND rk.rn = 1
    AND r.id = rk.reservation_id
    AND r.schedule_event_id IS NULL
  RETURNING r.id
)
SELECT 'APPLY_A_relinked_orphans' AS section, COUNT(*) AS updated_rows FROM updated;

-- (B) 予約0件だが current_participants>0 の公演を manual_restore で可視化（名前は復元できないが “人数” は復元できる）
WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id,
    COALESCE(NULLIF(current_setting('app.recover_since', true), ''), '2024-01-01')::date AS since_date,
    COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date,
    (COALESCE(NULLIF(current_setting('app.do_apply', true), ''), 'false') = 'true') AS do_apply
),
targets AS (
  SELECT
    se.*,
    COALESCE(sc.player_count_max, se.max_participants, se.capacity, 8) AS max_participants
  FROM public.schedule_events se
  LEFT JOIN public.scenarios sc ON sc.id = se.scenario_id
  JOIN params p ON p.org_id = se.organization_id
  WHERE
    se.date::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
    AND COALESCE(se.current_participants, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.reservations r WHERE r.schedule_event_id = se.id
    )
),
ins AS (
  INSERT INTO public.reservations (
    id, organization_id, reservation_number, title, scenario_id, store_id, customer_id, created_by,
    schedule_event_id, requested_datetime, duration, participant_count, participant_names,
    base_price, options_price, total_price, discount_amount, final_price, unit_price,
    payment_method, payment_status, status, customer_notes, reservation_source, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    t.organization_id,
    (to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4))),
    COALESCE((t.scenarios->>'title')::text, t.scenario, ''),
    t.scenario_id,
    t.store_id,
    NULL::uuid,
    NULL::uuid,
    t.id,
    (t.date + t.start_time)::timestamptz,
    COALESCE(t.duration, 0),
    LEAST(COALESCE(t.current_participants, 0), t.max_participants)::int,
    ARRAY[]::text[],
    0, 0, 0, 0, 0, 0,
    'onsite', 'paid', 'confirmed',
    '（復元）予約が無いが人数が入っていたため manual_restore を作成'::text,
    'manual_restore'::text,
    now(), now()
  FROM targets t, params p
  WHERE p.do_apply = true
  RETURNING id
)
SELECT 'APPLY_B_insert_manual_restore' AS section, COUNT(*) AS inserted_rows FROM ins;

