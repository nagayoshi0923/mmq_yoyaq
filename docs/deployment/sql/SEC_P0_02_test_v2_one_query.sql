-- SEC-P0-02 v2 動作テスト: SQL Editor向け 1クエリ版（結果1行）
--
-- 使い方:
--   <event_id>, <organization_id>, <customer_id>, <customer_user_id> を TS-0 の結果で置換して実行
-- 合格条件:
--   結果の pass が true
--
WITH
ids AS (
  SELECT
    '<event_id>'::uuid AS event_id,
    '<organization_id>'::uuid AS organization_id,
    '<customer_id>'::uuid AS customer_id,
    '<customer_user_id>'::uuid AS customer_user_id
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
SELECT (SELECT rid FROM call) AS reservation_id, true AS pass;

