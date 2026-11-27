-- 20261113100000_schedule_slot_rules の巻き戻し: 固定枠の表を消す。
-- 公演・予約には触れない（下書き自動作成で作った公演はふつうの公演として残る）。
-- 戻す前に画面・API を旧版へ戻すこと（新しい画面のまま戻すと、下書き自動作成の固定枠が読めずにエラーになる）。
-- 固定枠の表は、消す前に rollback_backup へ退避する（2026-10-20 監査 R5）。
BEGIN;
CREATE SCHEMA IF NOT EXISTS rollback_backup;
REVOKE ALL ON SCHEMA rollback_backup FROM PUBLIC, anon, authenticated;
DO $backup$
DECLARE v_dst text := 'schedule_slot_rules_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_rows bigint;
BEGIN
  IF to_regclass('public.schedule_slot_rules') IS NULL THEN RETURN; END IF;
  IF to_regclass(format('rollback_backup.%I', v_dst)) IS NOT NULL THEN
    RAISE EXCEPTION '退避先 rollback_backup.% が既にあります。中身を確かめて別名へ移してから流し直してください', v_dst;
  END IF;
  EXECUTE format('CREATE TABLE rollback_backup.%I AS TABLE public.schedule_slot_rules', v_dst);
  EXECUTE format('REVOKE ALL ON rollback_backup.%I FROM PUBLIC, anon, authenticated', v_dst);
  EXECUTE format('SELECT count(*) FROM rollback_backup.%I', v_dst) INTO v_rows;
  RAISE NOTICE '退避しました: public.schedule_slot_rules → rollback_backup.% (% 行)', v_dst, v_rows;
END $backup$;
DROP TABLE IF EXISTS public.schedule_slot_rules;
COMMIT;
