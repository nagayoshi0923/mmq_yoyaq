-- =============================================================================
-- RECOVER TS-1: 孤児予約（schedule_event_id が NULL）を公演に再紐付けして復元
-- =============================================================================
--
-- 想定している症状:
-- - 公演ダイアログ「予約者」タブが「予約はありません」になる
-- - しかし過去に「参加者を追加（デモ/スタッフ/当日参加）」をした覚えがある
-- - 予約レコードは存在するが schedule_event_id が NULL のため、公演に紐付かず見えない
--
-- 目的:
-- - reservations の孤児レコードを schedule_events に再紐付けし、UI上で復元する
--
-- 対象（安全側）:
-- - reservation_source が demo / demo_auto / walk_in / staff_participation / staff_entry / manual_restore
-- - schedule_event_id IS NULL
--
-- パラメータ（任意・置換不要）:
--   SELECT set_config('app.recover_org_id', 'a0000000-0000-0000-0000-000000000001', false);
--   SELECT set_config('app.recover_since', '2024-01-01', false);
--   SELECT set_config('app.recover_until', '2026-12-31', false);
--
-- 実行手順:
-- 1) (Preview) を実行して候補を確認
-- 2) 問題なければ (Apply) を実行
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (Preview) 紐付け候補の表示
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    COALESCE(
      NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
      get_user_organization_id(),
      'a0000000-0000-0000-0000-000000000001'::uuid
    ) AS org_id,
    COALESCE(NULLIF(current_setting('app.recover_since', true), ''), '2024-01-01')::date AS since_date,
    COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date
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
    r.customer_name,
    r.customer_notes,
    r.participant_count,
    r.participant_names,
    r.requested_datetime,
    (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date AS req_date_jst,
    date_trunc('minute', (r.requested_datetime AT TIME ZONE 'Asia/Tokyo'))::time AS req_time_jst
  FROM public.reservations r
  JOIN params p ON p.org_id = r.organization_id
  WHERE
    r.schedule_event_id IS NULL
    AND r.reservation_source IN ('demo', 'demo_auto', 'walk_in', 'staff_participation', 'staff_entry', 'manual_restore')
    AND (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
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
    -- マッチ度（店/シナリオが一致したら加点）
    (CASE WHEN o.store_id IS NOT NULL AND o.store_id = se.store_id THEN 2 ELSE 0 END) +
    (CASE WHEN o.scenario_id IS NOT NULL AND o.scenario_id = se.scenario_id THEN 2 ELSE 0 END) +
    (CASE WHEN o.title IS NOT NULL AND o.title <> '' AND o.title = se.scenario THEN 1 ELSE 0 END) AS match_score
  FROM orphans o
  JOIN public.schedule_events se
    ON se.organization_id = (SELECT org_id FROM params)
   -- schedule_events.date は DATE 型を想定（text ではない）
   AND se.date = o.req_date_jst
   -- start_time は time / text どちらでも比較できるように time に寄せる
   AND date_trunc('minute', se.start_time::time)::time = o.req_time_jst
),
ranked AS (
  SELECT
    m.*,
    row_number() OVER (PARTITION BY m.reservation_id ORDER BY m.match_score DESC, m.schedule_event_id) AS rn
  FROM matched m
)
SELECT
  'PREVIEW' AS section,
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
  match_score
FROM ranked
WHERE rn = 1
ORDER BY requested_datetime DESC
LIMIT 200;

-- -----------------------------------------------------------------------------
-- (Apply) 紐付けを反映（必要な場合に実行）
-- -----------------------------------------------------------------------------
-- WITH params AS (
--   SELECT
--     COALESCE(
--       NULLIF(current_setting('app.recover_org_id', true), '')::uuid,
--       get_user_organization_id(),
--       'a0000000-0000-0000-0000-000000000001'::uuid
--     ) AS org_id,
--     COALESCE(NULLIF(current_setting('app.recover_since', true), ''), '2024-01-01')::date AS since_date,
--     COALESCE(NULLIF(current_setting('app.recover_until', true), ''), now()::date::text)::date AS until_date
-- ),
-- orphans AS (
--   SELECT
--     r.id AS reservation_id,
--     r.organization_id AS reservation_org_id,
--     r.reservation_source,
--     r.requested_datetime,
--     (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date AS req_date_jst,
--     date_trunc('minute', (r.requested_datetime AT TIME ZONE 'Asia/Tokyo'))::time AS req_time_jst,
--     r.store_id,
--     r.scenario_id,
--     r.title
--   FROM public.reservations r
--   JOIN params p ON p.org_id = r.organization_id
--   WHERE
--     r.schedule_event_id IS NULL
--     AND r.reservation_source IN ('demo', 'demo_auto', 'walk_in', 'staff_participation', 'staff_entry', 'manual_restore')
--     AND (r.requested_datetime AT TIME ZONE 'Asia/Tokyo')::date BETWEEN (SELECT since_date FROM params) AND (SELECT until_date FROM params)
-- ),
-- matched AS (
--   SELECT
--     o.reservation_id,
--     se.id AS schedule_event_id,
--     (CASE WHEN o.store_id IS NOT NULL AND o.store_id = se.store_id THEN 2 ELSE 0 END) +
--     (CASE WHEN o.scenario_id IS NOT NULL AND o.scenario_id = se.scenario_id THEN 2 ELSE 0 END) +
--     (CASE WHEN o.title IS NOT NULL AND o.title <> '' AND o.title = se.scenario THEN 1 ELSE 0 END) AS match_score
--   FROM orphans o
--   JOIN public.schedule_events se
--     ON se.organization_id = (SELECT org_id FROM params)
--    AND se.date = o.req_date_jst::text
--    AND date_trunc('minute', se.start_time)::time = o.req_time_jst
-- ),
-- ranked AS (
--   SELECT
--     m.*,
--     row_number() OVER (PARTITION BY m.reservation_id ORDER BY m.match_score DESC, m.schedule_event_id) AS rn
--   FROM matched m
-- )
-- UPDATE public.reservations r
-- SET schedule_event_id = rk.schedule_event_id
-- FROM ranked rk
-- WHERE rk.rn = 1
--   AND r.id = rk.reservation_id
--   AND r.schedule_event_id IS NULL;

