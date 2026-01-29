-- SEC-P0-04 TS-1: 貸切承認RPCのアトミック動作テスト（ROLLBACK付き / 置換不要）
--
-- 期待: pass=true が返る
-- 注意: BEGIN〜ROLLBACK を含む（副作用なし）

BEGIN;
SET LOCAL ROLE authenticated;

WITH picked AS (
  SELECT
    r.id AS reservation_id,
    r.organization_id AS organization_id,
    r.candidate_datetimes AS candidate_datetimes,
    -- 候補0を使用（フロントと同様に candidates から選ぶ）
    (r.candidate_datetimes->'candidates'->0->>'date')::date AS selected_date,
    (r.candidate_datetimes->'candidates'->0->>'startTime')::time AS selected_start_time,
    (r.candidate_datetimes->'candidates'->0->>'endTime')::time AS selected_end_time,
    -- requestedStores[0].storeId を優先。なければ同組織のstoreを拾う
    COALESCE(
      (r.candidate_datetimes->'requestedStores'->0->>'storeId')::uuid,
      (SELECT s.id FROM stores s WHERE s.organization_id = r.organization_id ORDER BY s.created_at NULLS LAST, s.id LIMIT 1)
    ) AS selected_store_id,
    -- 同組織のスタッフ（user_idあり）をGMとして選ぶ
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
auth AS (
  SELECT
    set_config('request.jwt.claim.sub', picked.gm_user_id::text, true) AS _sub,
    set_config(
      'request.jwt.claims',
      json_build_object('sub', picked.gm_user_id, 'role', 'authenticated')::text,
      true
    ) AS _claims
  FROM picked
  WHERE picked.gm_user_id IS NOT NULL
),
call AS (
  SELECT
    picked.reservation_id,
    approve_private_booking(
      picked.reservation_id,
      picked.selected_date,
      picked.selected_start_time,
      picked.selected_end_time,
      picked.selected_store_id,
      picked.selected_gm_id,
      picked.candidate_datetimes,
      picked.scenario_title,
      picked.customer_name
    ) AS schedule_event_id
  FROM picked
  JOIN auth ON TRUE
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
  reservation_id,
  schedule_event_id,
  (
    reservation_status = 'confirmed'
    AND reservation_schedule_event_id = schedule_event_id
    AND schedule_event_exists IS NOT NULL
  ) AS pass
FROM check_after;

ROLLBACK;

