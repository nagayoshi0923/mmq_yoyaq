-- 20261022010000_create_schedule_event_with_staff の巻き戻し。
-- 関数と作成要求 ID の表を消す。作成済みの公演・担当・席予約・作成履歴はそのまま残る（データは変えない）。
-- 戻す前に画面・API を旧版（公演作成 → 担当を別保存）へ戻すこと。新しい画面・API のまま戻すと、画面からの公演の追加が失敗する。
-- 作成要求 ID の表は、消す前に rollback_backup へ退避する（2026-10-20 監査 R5）。
-- 当て直すときは migration（同名）が退避から書き戻し、件数と対応を照合する（公演が消えた行は戻さない）。
-- 退避と当て直しの間に同じ要求 ID で保存されることはない（旧版の画面は要求 ID を送らない）。
BEGIN;
CREATE SCHEMA IF NOT EXISTS rollback_backup;
REVOKE ALL ON SCHEMA rollback_backup FROM PUBLIC, anon, authenticated;
DO $backup$
DECLARE v_dst text := 'schedule_event_create_requests_backup_' || to_char(now() AT TIME ZONE 'Asia/Tokyo', 'YYYYMMDD'); v_rows bigint;
BEGIN
  IF to_regclass('public.schedule_event_create_requests') IS NULL THEN RETURN; END IF;
  IF to_regclass(format('rollback_backup.%I', v_dst)) IS NOT NULL THEN
    RAISE EXCEPTION '退避先 rollback_backup.% が既にあります。中身を確かめて別名へ移してから流し直してください', v_dst;
  END IF;
  EXECUTE format('CREATE TABLE rollback_backup.%I AS TABLE public.schedule_event_create_requests', v_dst);
  EXECUTE format('REVOKE ALL ON rollback_backup.%I FROM PUBLIC, anon, authenticated', v_dst);
  EXECUTE format('SELECT count(*) FROM rollback_backup.%I', v_dst) INTO v_rows;
  RAISE NOTICE '退避しました: public.schedule_event_create_requests → rollback_backup.% (% 行)', v_dst, v_rows;
END $backup$;
DROP FUNCTION IF EXISTS public.create_schedule_event_with_staff(uuid, jsonb, text[], jsonb, jsonb);
DROP FUNCTION IF EXISTS public.find_schedule_event_create_request(uuid);
DROP TABLE IF EXISTS public.schedule_event_create_requests;
COMMIT;
