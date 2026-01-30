-- SEC-P0-02 v2 動作テスト: SQL Editor向け 1クエリ版（結果1行 / 置換不要）
--
-- 合格条件:
-- - 結果の pass が true
--
WITH
event AS (
  -- 空席があり、かつ予約制限（締切/当日カットオフ/事前日数）を満たす公演を選ぶ
  SELECT
    se.id,
    se.organization_id,
    se.scenario_id,
    se.store_id,
    se.date,
    se.start_time,
    se.reservation_deadline_hours,
    COALESCE(se.max_participants, se.capacity, 8) AS max_participants,
    COALESCE(r.reserved_count, 0) AS reserved_count,
    EXTRACT(EPOCH FROM ((se.date + se.start_time)::timestamptz - NOW())) / 3600.0 AS hours_until_event,
    rs.advance_booking_days,
    rs.same_day_booking_cutoff,
    rs.max_bookings_per_customer
  FROM schedule_events se
  JOIN scenarios sc ON sc.id = se.scenario_id
  JOIN LATERAL (
    SELECT
      max_participants_per_booking,
      advance_booking_days,
      same_day_booking_cutoff,
      max_bookings_per_customer
    FROM reservation_settings
    WHERE store_id = se.store_id
      AND (organization_id = se.organization_id OR organization_id IS NULL)
    ORDER BY CASE WHEN organization_id = se.organization_id THEN 1 ELSE 0 END DESC, organization_id NULLS LAST
    LIMIT 1
  ) rs ON true
  LEFT JOIN (
    SELECT schedule_event_id, COALESCE(SUM(participant_count), 0) AS reserved_count
    FROM reservations
    WHERE status IN ('pending', 'confirmed', 'gm_confirmed')
    GROUP BY schedule_event_id
  ) r ON r.schedule_event_id = se.id
  WHERE se.is_cancelled = false
    AND se.date >= CURRENT_DATE
    AND se.scenario_id IS NOT NULL
    AND se.store_id IS NOT NULL
    AND sc.participation_fee IS NOT NULL
    AND (COALESCE(se.max_participants, se.capacity, 8) - COALESCE(r.reserved_count, 0)) >= 1
    -- 予約制限（DB強制）に引っかからない公演だけに絞る
    AND (EXTRACT(EPOCH FROM ((se.date + se.start_time)::timestamptz - NOW())) / 3600.0) >= 0
    AND (se.reservation_deadline_hours IS NULL OR (EXTRACT(EPOCH FROM ((se.date + se.start_time)::timestamptz - NOW())) / 3600.0) >= se.reservation_deadline_hours)
    AND (rs.advance_booking_days IS NULL OR se.date <= (CURRENT_DATE + rs.advance_booking_days))
    AND (rs.same_day_booking_cutoff IS NULL OR se.date <> CURRENT_DATE OR (EXTRACT(EPOCH FROM ((se.date + se.start_time)::timestamptz - NOW())) / 3600.0) >= rs.same_day_booking_cutoff)
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.organization_id = se.organization_id
        AND c.user_id IS NOT NULL
    )
  ORDER BY se.date ASC, se.start_time ASC
  LIMIT 1
),
cust AS (
  -- max_bookings_per_customer に引っかからない顧客を優先的に選ぶ
  SELECT
    c.id,
    c.user_id
  FROM customers c
  CROSS JOIN event e
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS booking_count
    FROM reservations r
    JOIN schedule_events se ON se.id = r.schedule_event_id
    WHERE r.customer_id = c.id
      AND r.status IN ('pending', 'confirmed', 'gm_confirmed')
      AND se.organization_id = e.organization_id
      AND se.date = e.date
  ) bc ON true
  WHERE c.organization_id = e.organization_id
    AND c.user_id IS NOT NULL
    AND (e.max_bookings_per_customer IS NULL OR COALESCE(bc.booking_count, 0) < e.max_bookings_per_customer)
  ORDER BY COALESCE(bc.booking_count, 0) ASC, c.created_at DESC
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
  SELECT create_reservation_with_lock_v2(
    (SELECT event_id FROM ids),
    1,
    (SELECT customer_id FROM ids),
    'SEC_P0_02_TEST_V2',
    'sec-test@example.com',
    '0000000000',
    'NOTE',
    NULL,
    NULL
  ) AS rid
  FROM ctx
),
cleanup_cancel AS (
  UPDATE reservations
  SET status = 'cancelled',
      cancellation_reason = 'SEC_P0_02_TEST_V2_AUTO_CLEANUP'
  WHERE id = (SELECT rid FROM call)
  RETURNING 1
),
cleanup_delete AS (
  DELETE FROM reservations
  WHERE id = (SELECT rid FROM call)
  RETURNING 1
)
SELECT
  (SELECT rid FROM call) AS reservation_id,
  COALESCE((SELECT COUNT(*) FROM call) = 1, false) AS pass,
  CASE
    WHEN (SELECT COUNT(*) FROM event) = 0 THEN 'NO_EVENT_FOUND'
    WHEN (SELECT COUNT(*) FROM cust) = 0 THEN 'NO_CUSTOMER_FOUND'
    WHEN (SELECT COUNT(*) FROM call) = 0 THEN 'RPC_NOT_CALLED'
    ELSE 'OK'
  END AS reason;

