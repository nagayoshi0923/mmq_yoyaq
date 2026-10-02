-- QW-20261002-006 Phase 1-5（A11）: 公演の表示人数 current_participants と有効予約の人数合計がずれている公演のうち、
-- 再計算しても制約 schedule_events_participants_check（表示人数 <= COALESCE(max_participants, capacity)）に収まるものだけを
-- システム自身の再計算関数 recalc_current_participants_for_event で揃える。
-- 収まらないもの（予約合計が上限を超える公演）はデータを変えず、理由付きで退避表に記録する。
--   2026-10-02 本番の内訳: 再計算 3件（全て中止済み公演）／据え置き 13件
--   （6件 = 貸切予約が上限ちょうど + reservation_source='staff_participation' の1席 → スタッフ追加席を表示人数に含めない規則と
--     関数の合計規則が食い違う。関数側の規則統一は別 issue。7件 = 2025-12 の過去公演に入った demo 予約8名が上限超過）。
-- 元の値は archive.schedule_events_participants_backup_20261002 に保存し、rollback で戻せる。

CREATE SCHEMA IF NOT EXISTS archive;

CREATE TABLE IF NOT EXISTS archive.schedule_events_participants_backup_20261002 AS
WITH act AS (
  SELECT r.schedule_event_id, SUM(r.participant_count) AS s
  FROM public.reservations r
  WHERE r.status IN ('pending','confirmed','gm_confirmed','checked_in')
  GROUP BY r.schedule_event_id
)
SELECT e.id,
       e.current_participants,
       COALESCE(a.s, 0) AS computed_at_backup,
       COALESCE(e.max_participants, e.capacity) AS max_at_backup,
       CASE WHEN COALESCE(a.s, 0) <= COALESCE(e.max_participants, e.capacity, COALESCE(a.s, 0)) THEN 'recalc' ELSE 'kept_exceeds_max' END AS action,
       now() AS backed_up_at
FROM public.schedule_events e
LEFT JOIN act a ON a.schedule_event_id = e.id
WHERE COALESCE(e.current_participants, 0) <> COALESCE(a.s, 0);
-- 退避表は RLS を有効にしポリシーを置かない（service_role と所有者以外は読めない）。
ALTER TABLE archive.schedule_events_participants_backup_20261002 ENABLE ROW LEVEL SECURITY;


DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT id FROM archive.schedule_events_participants_backup_20261002 WHERE action = 'recalc' LOOP
    PERFORM public.recalc_current_participants_for_event(rec.id);
  END LOOP;
END $$;
