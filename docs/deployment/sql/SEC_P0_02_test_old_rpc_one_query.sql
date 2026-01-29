-- SEC-P0-02 改ざんテスト（旧RPC）: SQL Editor向け 1クエリ版（結果1行 / 置換不要）
--
-- 合格条件:
-- - 結果の pass が true
--
WITH
event AS (
  -- 空席がある公演を選ぶ（満席だと P0004: INSUFFICIENT_SEATS になるため）
  SELECT
    se.id,
    se.organization_id,
    se.date,
    se.start_time,
    COALESCE(se.max_participants, se.capacity, 8) AS max_participants,
    COALESCE(r.reserved_count, 0) AS reserved_count
  FROM schedule_events se
  LEFT JOIN (
    SELECT schedule_event_id, COALESCE(SUM(participant_count), 0) AS reserved_count
    FROM reservations
    WHERE status IN ('pending', 'confirmed', 'gm_confirmed')
    GROUP BY schedule_event_id
  ) r ON r.schedule_event_id = se.id
  WHERE se.is_cancelled = false
    AND se.date >= CURRENT_DATE
    AND (COALESCE(se.max_participants, se.capacity, 8) - COALESCE(r.reserved_count, 0)) >= 1
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.organization_id = se.organization_id
        AND c.user_id IS NOT NULL
    )
  ORDER BY se.date ASC, se.start_time ASC
  LIMIT 1
),
cust AS (
  SELECT id, user_id
  FROM customers
  WHERE organization_id = (SELECT organization_id FROM event)
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
),
ids AS (
  SELECT
    (SELECT id FROM event) AS event_id,
    (SELECT organization_id FROM event) AS organization_id,
    (SELECT id FROM cust) AS customer_id,
    (SELECT user_id FROM cust) AS customer_user_id
),
ctx AS (
  SELECT
    set_config('request.jwt.claim.sub', (SELECT customer_user_id::text FROM ids), true) AS _a,
    set_config('request.jwt.claims', json_build_object('sub', (SELECT customer_user_id FROM ids))::text, true) AS _b,
    set_config('row_security', 'off', true) AS _rs
),
call AS (
  SELECT create_reservation_with_lock(
    (SELECT event_id FROM ids),
    1,
    (SELECT customer_id FROM ids),
    'SEC_P0_02_TEST',
    'sec-test@example.com',
    '0000000000',
    NULL,
    NULL,
    '2000-01-01T00:00:00Z'::timestamptz, -- 改ざん
    999,                                 -- 改ざん
    1, 1, 1,                             -- 改ざん
    to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)),
    'SEC_P0_02_TEST_NOTES',
    NULL,
    (SELECT organization_id FROM ids),
    'SEC_P0_02_TEST_TITLE'
  ) AS rid
  FROM ctx
),
res AS (
  SELECT
    r.id,
    r.unit_price,
    r.total_price,
    r.requested_datetime,
    (SELECT (se.date + se.start_time)::timestamptz
     FROM schedule_events se
     WHERE se.id = (SELECT event_id FROM ids)) AS expected_dt
  FROM reservations r
  WHERE r.id = (SELECT rid FROM call)
),
cleanup_cancel AS (
  UPDATE reservations
  SET status = 'cancelled',
      cancellation_reason = 'SEC_P0_02_TEST_AUTO_CLEANUP'
  WHERE id = (SELECT rid FROM call)
  RETURNING 1
),
cleanup_delete AS (
  DELETE FROM reservations
  WHERE id = (SELECT rid FROM call)
  RETURNING 1
)
SELECT
  id AS reservation_id,
  unit_price,
  total_price,
  requested_datetime,
  expected_dt,
  (unit_price <> 1 AND total_price <> 1 AND requested_datetime = expected_dt) AS pass
FROM res;

