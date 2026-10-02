-- QW-20261002-006 / #730（A11）: 公演の表示人数の規則を1つにする。
-- 規則: current_participants = 有効な予約（pending / confirmed / gm_confirmed / checked_in）の participant_count 合計。
--       出どころ（web / 貸切 / 管理者の手動追加 / スタッフ席）を問わず全て数える。
--       管理者の手動追加は RPC の満員判定を通さない設計（画面の注記どおり）なので、合計が定員を超えることはあり得る。
--       顧客の予約は RPC が残席（定員 - 合計）で止めるため、超過は管理者操作でしか起きない。
-- これと矛盾していたのは制約 schedule_events_participants_check（表示人数 <= 定員、NOT VALID）で、
-- 管理者が満席の公演へスタッフ席を足すと再計算トリガーが制約違反で失敗する。制約を外す。
-- あわせて、2025-12 の過去公演に demo 予約（8名）が定員（4〜7）を超えて入っていたものは、demo の人数を定員に揃える
-- （demo はスクリプトが見た目を埋めるために入れた金額0の予約で、業務上の意味は無い）。
-- その上で、合計とずれている公演を全て再計算する。元の値は退避表に保存し、rollback で戻せる。

CREATE SCHEMA IF NOT EXISTS archive;

-- 1) demo 予約の人数を定員に揃える（元の値を退避）
CREATE TABLE IF NOT EXISTS archive.demo_reservations_capped_20261002 AS
SELECT r.id AS reservation_id, r.schedule_event_id, r.participant_count AS participant_count_before,
       COALESCE(e.max_participants, e.capacity) AS cap, now() AS backed_up_at
FROM public.reservations r
JOIN public.schedule_events e ON e.id = r.schedule_event_id
WHERE r.reservation_source = 'demo'
  AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')
  AND COALESCE(e.max_participants, e.capacity) IS NOT NULL
  AND r.participant_count > COALESCE(e.max_participants, e.capacity);
ALTER TABLE archive.demo_reservations_capped_20261002 ENABLE ROW LEVEL SECURITY;

-- 2) 制約を外す（再計算トリガーが管理者の超過を止めないようにする）
ALTER TABLE public.schedule_events DROP CONSTRAINT IF EXISTS schedule_events_participants_check;

-- 3) demo の人数を定員へ（トリガーで表示人数も再計算される）
UPDATE public.reservations r
SET participant_count = b.cap
FROM archive.demo_reservations_capped_20261002 b
WHERE b.reservation_id = r.id;

-- 4) 合計とずれている公演を全て再計算（元の表示人数を退避）
CREATE TABLE IF NOT EXISTS archive.schedule_events_participants_backup_20261002b AS
SELECT e.id, e.current_participants, now() AS backed_up_at
FROM public.schedule_events e
WHERE COALESCE(e.current_participants, 0) <> COALESCE((
  SELECT SUM(r.participant_count) FROM public.reservations r
  WHERE r.schedule_event_id = e.id AND r.status IN ('pending','confirmed','gm_confirmed','checked_in')), 0);
ALTER TABLE archive.schedule_events_participants_backup_20261002b ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM archive.schedule_events_participants_backup_20261002b LOOP
    PERFORM public.recalc_current_participants_for_event(rec.id);
  END LOOP;
END $$;
