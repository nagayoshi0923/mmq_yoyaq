-- SEC-P1-03 TS-1 Step A: reservations のUPDATEでhistoryが増えることを確認（置換不要）
--
-- 期待: pass=true
-- 注意: BEGIN のみ行い、ROLLBACKしない（必ずStepBを実行）

BEGIN;

-- NOTE:
-- 同一ステートメント内だとトリガで挿入された履歴行がCOUNTで見えないケースがあるため、
-- 更新と検証を別ステートメントに分割する（SQL Editorの表示も最終SELECTに寄せる）。

-- 1) 対象予約IDを選び、更新前の履歴件数を保存
WITH picked AS (
  SELECT r.id AS reservation_id
  FROM reservations r
  WHERE r.organization_id IS NOT NULL
  ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC NULLS LAST, r.id
  LIMIT 1
),
before_cnt AS (
  SELECT
    p.reservation_id,
    (SELECT COUNT(*) FROM public.reservations_history h WHERE h.reservation_id = p.reservation_id) AS cnt_before
  FROM picked p
)
SELECT
  set_config('sec_p1_03.reservation_id', (SELECT reservation_id::text FROM before_cnt), true) AS _rid,
  set_config('sec_p1_03.cnt_before', (SELECT cnt_before::text FROM before_cnt), true) AS _before;

-- 2) UPDATE（トリガで履歴が入る想定）
WITH upd AS (
  UPDATE reservations
  SET updated_at = NOW()
  WHERE id = current_setting('sec_p1_03.reservation_id', true)::uuid
  RETURNING 1
)
SELECT set_config('sec_p1_03.updated_rows', (SELECT COUNT(*)::text FROM upd), true) AS _updated;

-- 3) 検証（最終SELECTが結果として表示される）
WITH vars AS (
  SELECT
    current_setting('sec_p1_03.reservation_id', true)::uuid AS reservation_id,
    current_setting('sec_p1_03.cnt_before', true)::int AS cnt_before,
    current_setting('sec_p1_03.updated_rows', true)::int AS updated_rows
),
after_cnt AS (
  SELECT
    v.reservation_id,
    v.cnt_before,
    v.updated_rows,
    (SELECT COUNT(*) FROM public.reservations_history h WHERE h.reservation_id = v.reservation_id) AS cnt_after
  FROM vars v
)
SELECT
  reservation_id,
  cnt_before,
  cnt_after,
  updated_rows,
  (updated_rows = 1 AND cnt_after = cnt_before + 1) AS pass
FROM after_cnt;

