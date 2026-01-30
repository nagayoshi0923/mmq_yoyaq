-- SEC-P0-04 TS-0.5: 貸切リクエスト在庫確認（置換不要）
-- 目的: web_private が存在するか / 未承認があるか / candidate_datetimesの形が想定通りか を確認

WITH base AS (
  SELECT
    id,
    status,
    created_at,
    reservation_source,
    candidate_datetimes
  FROM reservations
  WHERE reservation_source = 'web_private'
),
by_status AS (
  SELECT status, count(*) AS cnt
  FROM base
  GROUP BY status
),
latest AS (
  SELECT
    id,
    status,
    created_at,
    jsonb_typeof(candidate_datetimes) AS candidate_datetimes_type,
    jsonb_typeof(candidate_datetimes->'candidates') AS candidates_type,
    COALESCE(jsonb_array_length(candidate_datetimes->'candidates'), 0) AS candidates_len,
    (candidate_datetimes->'candidates'->0->>'date') AS c0_date,
    (candidate_datetimes->'candidates'->0->>'startTime') AS c0_startTime,
    (candidate_datetimes->'candidates'->0->>'endTime') AS c0_endTime,
    (candidate_datetimes->'requestedStores'->0->>'storeId') AS rs0_storeId
  FROM base
  ORDER BY created_at DESC NULLS LAST, id
  LIMIT 5
)
SELECT
  (SELECT count(*) FROM base) AS total_web_private,
  (SELECT jsonb_agg(by_status ORDER BY by_status.cnt DESC) FROM by_status) AS status_counts,
  (SELECT jsonb_agg(latest ORDER BY latest.created_at DESC) FROM latest) AS latest_samples;

