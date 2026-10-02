-- E2追加の関数とtriggerだけを戻す。既存行・FK・ACL/RLSは保持する。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.guard_new_reservation_event_alias()')
   AND p.prorettype='trigger'::regtype AND p.prosecdef
   AND p.proconfig=ARRAY['search_path=public','row_security=off']::text[]
   AND md5(p.prosrc)='b8b13cd55d978504f0b262a9bcfeace6')
   OR NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.reservations'::regclass
   AND t.tgname='guard_new_reservation_event_alias' AND NOT t.tgisinternal
   AND pg_get_triggerdef(t.oid)='CREATE TRIGGER guard_new_reservation_event_alias BEFORE INSERT OR UPDATE OF event_id ON public.reservations FOR EACH ROW EXECUTE FUNCTION guard_new_reservation_event_alias()') THEN
   RAISE EXCEPTION '旧公演参照ガードの復元対象が想定と異なります';
 END IF;
END $$;
DROP TRIGGER guard_new_reservation_event_alias ON public.reservations;
DROP FUNCTION public.guard_new_reservation_event_alias();
-- CASCADEは使わない。第三者の依存や本文変更があれば停止する。
COMMIT;
