-- SEC-P1-03 TS-1 Step A: reservations のUPDATEでhistoryが増えることを確認（置換不要）
--
-- 期待: pass=true
-- 注意: BEGIN のみ行い、ROLLBACKしない（必ずStepBを実行）

BEGIN;

WITH picked AS (
  SELECT
    r.id AS reservation_id,
    r.organization_id AS organization_id
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
),
upd AS (
  UPDATE reservations r
  SET updated_at = NOW()
  WHERE r.id = (SELECT reservation_id FROM picked)
  RETURNING r.id AS reservation_id
),
after_cnt AS (
  SELECT
    b.reservation_id,
    b.cnt_before,
    (SELECT COUNT(*) FROM public.reservations_history h WHERE h.reservation_id = b.reservation_id) AS cnt_after,
    (SELECT COUNT(*) FROM upd) AS updated_rows
  FROM before_cnt b
)
SELECT
  reservation_id,
  cnt_before,
  cnt_after,
  updated_rows,
  (updated_rows = 1 AND cnt_after = cnt_before + 1) AS pass
FROM after_cnt;

