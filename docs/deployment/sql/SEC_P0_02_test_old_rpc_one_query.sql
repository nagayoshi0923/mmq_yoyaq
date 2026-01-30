-- SEC-P0-02 改ざんテスト（旧RPC）: SQL Editor向け（ROLLBACK付き / 置換不要）
--
-- 合格条件:
-- - 結果の pass が true
--
BEGIN;

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
    (se.date + se.start_time)::timestamptz AS event_dt,
    EXTRACT(EPOCH FROM ((se.date + se.start_time)::timestamptz - NOW())) / 3600.0 AS hours_until_event,
    rs.advance_booking_days,
    rs.same_day_booking_cutoff,
    rs.max_bookings_per_customer
  FROM schedule_events se
  JOIN scenarios sc ON sc.id = se.scenario_id
  JOIN LATERAL (
    SELECT
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
    (SELECT user_id FROM cust) AS customer_user_id,
    (SELECT event_dt FROM event) AS expected_dt
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
admin_ctx AS (
  -- テスト後の参照は「SQL Editorの権限」で行う（RLS/claims の影響を受けにくくする）
  SELECT
    set_config('request.jwt.claim.sub', '', true) AS _sub_clear,
    set_config('request.jwt.claims', '{}'::text, true) AS _claims_clear,
    set_config('row_security', 'off', true) AS _rs
),
res_admin AS (
  -- 予約行を直接参照（見えない場合に備えて history も参照する）
  SELECT
    r.id AS reservation_id,
    r.unit_price,
    r.total_price,
    r.requested_datetime
  FROM reservations r, admin_ctx
  WHERE r.id = (SELECT rid FROM call)
),
hist AS (
  -- reservations が見えない場合の代替: 監査ログから値を拾う
  SELECT
    h.reservation_id,
    (h.new_values->>'unit_price')::int AS unit_price,
    (h.new_values->>'total_price')::int AS total_price,
    (h.new_values->>'requested_datetime')::timestamptz AS requested_datetime
  FROM reservations_history h, admin_ctx
  WHERE h.reservation_id = (SELECT rid FROM call)
  ORDER BY h.created_at DESC
  LIMIT 1
),
status AS (
  SELECT
    (SELECT rid FROM call) AS call_returned_id,
    (SELECT expected_dt FROM ids) AS expected_dt,
    (SELECT COUNT(*) FROM event) AS event_cnt,
    (SELECT COUNT(*) FROM cust) AS cust_cnt,
    (SELECT COUNT(*) FROM call) AS call_cnt,
    (SELECT COUNT(*) FROM res_admin) AS res_cnt,
    (SELECT COUNT(*) FROM hist) AS hist_cnt
)
SELECT
  (SELECT call_returned_id FROM status) AS call_returned_id,
  COALESCE((SELECT reservation_id FROM res_admin), (SELECT reservation_id FROM hist)) AS reservation_id,
  COALESCE((SELECT unit_price FROM res_admin), (SELECT unit_price FROM hist)) AS unit_price,
  COALESCE((SELECT total_price FROM res_admin), (SELECT total_price FROM hist)) AS total_price,
  COALESCE((SELECT requested_datetime FROM res_admin), (SELECT requested_datetime FROM hist)) AS requested_datetime,
  (SELECT expected_dt FROM status) AS expected_dt,
  COALESCE(
    (
      SELECT
        (unit_price <> 1 AND total_price <> 1 AND requested_datetime = (SELECT expected_dt FROM status))
      FROM (
        SELECT
          COALESCE((SELECT unit_price FROM res_admin), (SELECT unit_price FROM hist)) AS unit_price,
          COALESCE((SELECT total_price FROM res_admin), (SELECT total_price FROM hist)) AS total_price,
          COALESCE((SELECT requested_datetime FROM res_admin), (SELECT requested_datetime FROM hist)) AS requested_datetime
      ) x
    ),
    false
  ) AS pass,
  CASE
    WHEN (SELECT event_cnt FROM status) = 0 THEN 'NO_EVENT_FOUND'
    WHEN (SELECT cust_cnt FROM status) = 0 THEN 'NO_CUSTOMER_FOUND'
    WHEN (SELECT call_cnt FROM status) = 0 THEN 'RPC_NOT_CALLED'
    WHEN (SELECT call_returned_id FROM status) IS NULL THEN 'RPC_RETURNED_NULL_ID'
    WHEN (SELECT res_cnt FROM status) = 0 AND (SELECT hist_cnt FROM status) = 0 THEN 'RESERVATION_NOT_VISIBLE_OR_NOT_INSERTED'
    WHEN (SELECT res_cnt FROM status) = 0 AND (SELECT hist_cnt FROM status) = 1 THEN 'RESERVATION_VISIBLE_VIA_HISTORY_ONLY'
    ELSE 'OK'
  END AS reason;

ROLLBACK;

