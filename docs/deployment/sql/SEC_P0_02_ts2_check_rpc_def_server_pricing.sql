-- SEC-P0-02 TS-2: RPC定義が「サーバー計算値」を使っているか確認（置換不要）
--
-- 目的:
-- - SQL Editor環境によっては reservations の参照ができず、改ざんテスト（INSERT→SELECT）が成立しないことがある。
-- - その場合でも、関数定義から「料金/日時がサーバー側で確定され、クライアント入力を使っていない」ことを機械的に確認する。
--
-- 合格条件:
-- - 両方の pass が true

WITH defs AS (
  SELECT
    p.proname,
    p.oid::regprocedure AS signature,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('create_reservation_with_lock', 'create_reservation_with_lock_v2')
),
ins AS (
  SELECT
    signature,
    definition,
    -- INSERT...RETURNING の範囲だけ抽出（改行/スペースに強い判定用）
    substring(definition from '(?s)INSERT INTO reservations.*?RETURNING') AS insert_block
  FROM defs
)
SELECT
  signature,
  -- requested_datetime をイベント日時から確定している（入力値を無視）
  (position('v_requested_datetime' in definition) > 0) AS has_v_requested_datetime_var,
  (
    position('v_requested_datetime := (v_date + v_start_time)' in definition) > 0 OR
    position('v_requested_datetime := (v_date + v_start_time)::timestamptz' in definition) > 0 OR
    position('v_requested_datetime := (v_date + v_start_time)::timestamp' in definition) > 0
  ) AS sets_requested_datetime_from_event,

  -- unit_price/total_price をサーバー計算している
  (position('v_total_price := v_unit_price * p_participant_count' in definition) > 0) AS sets_total_price_server_side,

  -- INSERT で unit_price/total_price/requested_datetime に v_* を使っている（改行/スペースに強い）
  (COALESCE(insert_block, '') ~ 'v_unit_price') AS inserts_v_unit_price,
  (COALESCE(insert_block, '') ~ 'v_total_price') AS inserts_v_total_price,
  (COALESCE(insert_block, '') ~ 'v_requested_datetime') AS inserts_v_requested_datetime,
  -- 旧RPCの入力値（p_*）を INSERT で使っていない（=改ざん余地がない）
  (COALESCE(insert_block, '') !~ 'p_unit_price') AS does_not_use_p_unit_price_in_insert,
  (COALESCE(insert_block, '') !~ 'p_total_price') AS does_not_use_p_total_price_in_insert,
  (COALESCE(insert_block, '') !~ 'p_base_price') AS does_not_use_p_base_price_in_insert,
  (COALESCE(insert_block, '') !~ 'p_requested_datetime') AS does_not_use_p_requested_datetime_in_insert,

  (
    position('v_total_price := v_unit_price * p_participant_count' in definition) > 0
    AND (
      position('v_requested_datetime := (v_date + v_start_time)' in definition) > 0 OR
      position('v_requested_datetime := (v_date + v_start_time)::timestamptz' in definition) > 0 OR
      position('v_requested_datetime := (v_date + v_start_time)::timestamp' in definition) > 0
    )
    AND (COALESCE(insert_block, '') ~ 'v_unit_price')
    AND (COALESCE(insert_block, '') ~ 'v_total_price')
    AND (COALESCE(insert_block, '') ~ 'v_requested_datetime')
    AND (COALESCE(insert_block, '') !~ 'p_unit_price')
    AND (COALESCE(insert_block, '') !~ 'p_total_price')
    AND (COALESCE(insert_block, '') !~ 'p_base_price')
    AND (COALESCE(insert_block, '') !~ 'p_requested_datetime')
  ) AS pass
FROM ins
ORDER BY signature;

