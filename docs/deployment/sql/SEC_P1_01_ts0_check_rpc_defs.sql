-- SEC-P1-01 TS-0: 予約制限強制がRPC定義に含まれることを確認（置換不要）

WITH defs AS (
  SELECT
    p.oid,
    p.oid::regprocedure AS signature,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('create_reservation_with_lock_v2', 'create_reservation_with_lock')
)
SELECT
  signature,
  -- 予約制限の例外コード（P0033〜P0038）が定義に含まれること（= DB側で制限を強制している目安）
  (position('P0033' in definition) > 0) AS has_p0033_advance_booking_limit,
  (position('P0034' in definition) > 0) AS has_p0034_max_participants_per_booking,
  (position('P0035' in definition) > 0) AS has_p0035_max_bookings_per_customer,
  (position('P0036' in definition) > 0) AS has_p0036_event_already_started,
  (position('P0037' in definition) > 0) AS has_p0037_reservation_deadline_passed,
  (position('P0038' in definition) > 0) AS has_p0038_same_day_cutoff_passed,
  (
    position('P0033' in definition) > 0 AND
    position('P0034' in definition) > 0 AND
    position('P0035' in definition) > 0 AND
    position('P0036' in definition) > 0 AND
    position('P0037' in definition) > 0 AND
    position('P0038' in definition) > 0
  ) AS pass,
  -- 必要なら全文も確認できるよう末尾に残す（表示が重い場合はコメントアウトしてOK）
  definition
FROM defs
ORDER BY signature;

