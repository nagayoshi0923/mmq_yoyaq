-- SEC-P0-04 TS-1 Step A: 貸切承認RPCのアトミック動作テスト（結果表示用 / 置換不要）
--
-- 期待: 1行返る（pass=true/false）
-- 注意: このSQLは BEGIN のみ行い、ROLLBACKしない（必ず Step B を続けて実行）

BEGIN;

-- NOTE:
-- Supabase SQL Editorでは `SET LOCAL ROLE authenticated` にするとRLSで対象行が見えないことがある。
-- ここでは SQL Editor（高権限）でピック/検証を行い、RPC呼び出しはJWT claimを staff に偽装して実行する。

-- -----------------------------------------------------------------------------
-- まず「候補選定 + RPC実行」を行い、結果をセッション変数へ保存する
-- （同一ステートメント内だと更新が見えないことがあるため、検証は別ステートメントで行う）
-- -----------------------------------------------------------------------------

WITH base_reservations AS (
  SELECT
    r.id AS reservation_id,
    r.created_at AS reservation_created_at,
    r.organization_id AS organization_id,
    r.candidate_datetimes AS candidate_datetimes,
    COALESCE(r.title, '') AS scenario_title,
    COALESCE(r.customer_name, '') AS customer_name
  FROM reservations r
  WHERE r.reservation_source = 'web_private'
    AND r.status IN ('pending', 'pending_gm', 'gm_confirmed', 'pending_store')
    AND r.candidate_datetimes IS NOT NULL
    AND jsonb_typeof(r.candidate_datetimes->'candidates') = 'array'
    AND jsonb_array_length(r.candidate_datetimes->'candidates') > 0
),
candidate_times AS (
  SELECT
    br.reservation_id,
    br.reservation_created_at,
    br.organization_id,
    br.candidate_datetimes,
    (cand->>'order')::int AS candidate_order,
    (cand->>'date')::date AS selected_date,
    (cand->>'startTime')::time AS selected_start_time,
    (cand->>'endTime')::time AS selected_end_time,
    br.scenario_title,
    br.customer_name
  FROM base_reservations br
  CROSS JOIN LATERAL jsonb_array_elements(br.candidate_datetimes->'candidates') AS cand
),
-- requestedStores がある場合はそれを優先、なければ同組織の店舗を候補にする
candidate_stores AS (
  SELECT
    ct.*,
    COALESCE(
      (rs->>'storeId')::uuid,
      s_any.id
    ) AS selected_store_id
  FROM candidate_times ct
  LEFT JOIN LATERAL jsonb_array_elements(ct.candidate_datetimes->'requestedStores') AS rs ON TRUE
  LEFT JOIN LATERAL (
    SELECT s.id
    FROM stores s
    WHERE s.organization_id = ct.organization_id
    ORDER BY s.created_at NULLS LAST, s.id
    LIMIT 1
  ) AS s_any ON TRUE
),
staff_pick AS (
  SELECT
    s.organization_id,
    s.id AS selected_gm_id,
    s.user_id AS gm_user_id
  FROM staff s
  WHERE s.user_id IS NOT NULL
),
candidates AS (
  SELECT
    cs.*,
    sp.selected_gm_id,
    sp.gm_user_id
  FROM candidate_stores cs
  LEFT JOIN staff_pick sp ON sp.organization_id = cs.organization_id
),
picked AS (
  -- 既存公演と被らない候補枠を選ぶ（DB側の SLOT_ALREADY_OCCUPIED を踏みにくくする）
  SELECT c.*
  FROM candidates c
  WHERE c.selected_date IS NOT NULL
    AND c.selected_start_time IS NOT NULL
    AND c.selected_end_time IS NOT NULL
    AND c.selected_store_id IS NOT NULL
    AND c.selected_gm_id IS NOT NULL
    AND c.gm_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM schedule_events se
      WHERE se.organization_id = c.organization_id
        AND se.date = c.selected_date
        AND se.store_id = c.selected_store_id
        AND se.is_cancelled = false
        AND se.start_time < c.selected_end_time
        AND se.end_time > c.selected_start_time
    )
  ORDER BY c.reservation_created_at DESC NULLS LAST, c.reservation_id, c.candidate_order NULLS LAST
  LIMIT 1
),
stats AS (
  SELECT
    (SELECT count(*) FROM base_reservations) AS base_reservations_cnt,
    (SELECT count(*) FROM candidate_times) AS candidate_times_cnt,
    (SELECT count(*) FROM candidate_stores) AS candidate_store_rows_cnt,
    (SELECT count(*) FROM candidates WHERE selected_store_id IS NOT NULL) AS with_store_cnt,
    (SELECT count(*) FROM candidates WHERE selected_gm_id IS NOT NULL AND gm_user_id IS NOT NULL) AS with_gm_cnt,
    (SELECT count(*) FROM candidates WHERE selected_store_id IS NOT NULL AND selected_gm_id IS NOT NULL AND gm_user_id IS NOT NULL) AS with_store_and_gm_cnt,
    (SELECT count(*) FROM candidates c
      WHERE c.selected_store_id IS NOT NULL
        AND c.selected_gm_id IS NOT NULL
        AND c.gm_user_id IS NOT NULL
        AND c.selected_date IS NOT NULL
        AND c.selected_start_time IS NOT NULL
        AND c.selected_end_time IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM schedule_events se
          WHERE se.organization_id = c.organization_id
            AND se.date = c.selected_date
            AND se.store_id = c.selected_store_id
            AND se.is_cancelled = false
            AND se.start_time < c.selected_end_time
            AND se.end_time > c.selected_start_time
        )
    ) AS non_conflict_cnt
),
guard AS (
  SELECT
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM picked) THEN 'NO_ELIGIBLE_PRIVATE_REQUEST'
      WHEN (SELECT gm_user_id FROM picked) IS NULL THEN 'GM_USER_ID_MISSING'
      WHEN (SELECT selected_store_id FROM picked) IS NULL THEN 'STORE_NOT_FOUND_FOR_ORG'
      WHEN (SELECT selected_date FROM picked) IS NULL THEN 'CANDIDATE_DATE_MISSING'
      WHEN (SELECT selected_start_time FROM picked) IS NULL THEN 'CANDIDATE_START_MISSING'
      WHEN (SELECT selected_end_time FROM picked) IS NULL THEN 'CANDIDATE_END_MISSING'
      ELSE NULL
    END AS guard_error
)
SELECT
  set_config('sec_p0_04.guard_error', COALESCE((SELECT guard_error FROM guard), ''), true) AS _guard,
  set_config('sec_p0_04.debug_stats', (SELECT to_jsonb(stats)::text FROM stats), true) AS _stats,
  -- JWT偽装（staffとしてRPCを叩く）
  set_config('request.jwt.claim.sub', (SELECT gm_user_id FROM picked)::text, true) AS _sub,
  set_config(
    'request.jwt.claims',
    json_build_object('sub', (SELECT gm_user_id FROM picked), 'role', 'authenticated')::text,
    true
  ) AS _claims,
  -- reservation_id / schedule_event_id を保存（検証は次のSELECTで行う）
  set_config('sec_p0_04.reservation_id', (SELECT reservation_id FROM picked)::text, true) AS _rid,
  set_config(
    'sec_p0_04.schedule_event_id',
    approve_private_booking(
      (SELECT reservation_id FROM picked),
      (SELECT selected_date FROM picked),
      (SELECT selected_start_time FROM picked),
      (SELECT selected_end_time FROM picked),
      (SELECT selected_store_id FROM picked),
      (SELECT selected_gm_id FROM picked),
      (SELECT candidate_datetimes FROM picked),
      (SELECT scenario_title FROM picked),
      (SELECT customer_name FROM picked)
    )::text,
    true
  ) AS _seid
WHERE (SELECT guard_error FROM guard) IS NULL;

-- -----------------------------------------------------------------------------
-- 検証（最終SELECTが結果として表示される）
-- -----------------------------------------------------------------------------

WITH vars AS (
  SELECT
    NULLIF(current_setting('sec_p0_04.guard_error', true), '') AS guard_error,
    current_setting('sec_p0_04.debug_stats', true) AS debug_stats_text,
    current_setting('sec_p0_04.reservation_id', true)::uuid AS reservation_id,
    current_setting('sec_p0_04.schedule_event_id', true)::uuid AS schedule_event_id
),
check_after AS (
  SELECT
    v.reservation_id,
    v.schedule_event_id,
    r.status AS reservation_status,
    r.schedule_event_id AS reservation_schedule_event_id,
    se.id AS schedule_event_exists
  FROM vars v
  JOIN reservations r ON r.id = v.reservation_id
  LEFT JOIN schedule_events se ON se.id = v.schedule_event_id
)
SELECT
  (SELECT reservation_id FROM vars) AS reservation_id,
  (SELECT schedule_event_id FROM vars) AS schedule_event_id,
  (
    (SELECT guard_error FROM vars) IS NULL
    AND (SELECT reservation_status FROM check_after) = 'confirmed'
    AND (SELECT reservation_schedule_event_id FROM check_after) = (SELECT schedule_event_id FROM vars)
  ) AS pass,
  (SELECT guard_error FROM vars) AS debug_guard_error,
  COALESCE((SELECT debug_stats_text::jsonb FROM vars), '{}'::jsonb) AS debug_stats,
  ((SELECT schedule_event_exists FROM check_after) IS NOT NULL) AS debug_schedule_event_visible,
  (SELECT reservation_status FROM check_after) AS debug_reservation_status,
  (SELECT reservation_schedule_event_id FROM check_after) AS debug_reservation_schedule_event_id;

