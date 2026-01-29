-- SEC-P0-04 TS-1 Step A: 貸切承認RPCのアトミック動作テスト（結果表示用 / 置換不要）
--
-- 期待: 1行返る（pass=true/false）
-- 注意: このSQLは BEGIN のみ行い、ROLLBACKしない（必ず Step B を続けて実行）

BEGIN;
SET LOCAL ROLE authenticated;

WITH picked AS (
  SELECT
    r.id AS reservation_id,
    r.organization_id AS organization_id,
    r.candidate_datetimes AS candidate_datetimes,
    (r.candidate_datetimes->'candidates'->0->>'date')::date AS selected_date,
    (r.candidate_datetimes->'candidates'->0->>'startTime')::time AS selected_start_time,
    (r.candidate_datetimes->'candidates'->0->>'endTime')::time AS selected_end_time,
    COALESCE(
      (r.candidate_datetimes->'requestedStores'->0->>'storeId')::uuid,
      (SELECT s.id FROM stores s WHERE s.organization_id = r.organization_id ORDER BY s.created_at NULLS LAST, s.id LIMIT 1)
    ) AS selected_store_id,
    (SELECT st.id FROM staff st WHERE st.organization_id = r.organization_id AND st.user_id IS NOT NULL ORDER BY st.created_at NULLS LAST, st.id LIMIT 1) AS selected_gm_id,
    (SELECT st.user_id FROM staff st WHERE st.organization_id = r.organization_id AND st.user_id IS NOT NULL ORDER BY st.created_at NULLS LAST, st.id LIMIT 1) AS gm_user_id,
    COALESCE(r.title, '') AS scenario_title,
    COALESCE(r.customer_name, '') AS customer_name
  FROM reservations r
  WHERE r.reservation_source = 'web_private'
    AND r.status IN ('pending', 'pending_gm', 'gm_confirmed', 'pending_store')
    AND r.candidate_datetimes IS NOT NULL
    AND jsonb_typeof(r.candidate_datetimes->'candidates') = 'array'
    AND jsonb_array_length(r.candidate_datetimes->'candidates') > 0
  ORDER BY r.created_at DESC NULLS LAST, r.id
  LIMIT 1
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
),
auth AS (
  SELECT
    set_config('request.jwt.claim.sub', (SELECT gm_user_id FROM picked)::text, true) AS _sub,
    set_config(
      'request.jwt.claims',
      json_build_object('sub', (SELECT gm_user_id FROM picked), 'role', 'authenticated')::text,
      true
    ) AS _claims
  WHERE (SELECT guard_error FROM guard) IS NULL
),
call AS (
  SELECT
    (SELECT reservation_id FROM picked) AS reservation_id,
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
    ) AS schedule_event_id
  FROM auth
),
check_after AS (
  SELECT
    c.reservation_id,
    c.schedule_event_id,
    r.status AS reservation_status,
    r.schedule_event_id AS reservation_schedule_event_id,
    se.id AS schedule_event_exists
  FROM call c
  JOIN reservations r ON r.id = c.reservation_id
  LEFT JOIN schedule_events se ON se.id = c.schedule_event_id
)
SELECT
  COALESCE((SELECT reservation_id FROM picked), NULL) AS reservation_id,
  COALESCE((SELECT schedule_event_id FROM call), NULL) AS schedule_event_id,
  (
    (SELECT guard_error FROM guard) IS NULL
    AND (SELECT reservation_status FROM check_after) = 'confirmed'
    AND (SELECT reservation_schedule_event_id FROM check_after) = (SELECT schedule_event_id FROM call)
    AND (SELECT schedule_event_exists FROM check_after) IS NOT NULL
  ) AS pass,
  (SELECT guard_error FROM guard) AS debug_guard_error;

