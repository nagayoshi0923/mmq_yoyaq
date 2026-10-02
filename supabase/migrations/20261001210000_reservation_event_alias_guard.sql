-- E2: 新規の非NULL旧公演参照だけを正本・組織に照合。既存行は書き換えない。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF to_regprocedure('public.guard_new_reservation_event_alias()') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.reservations'::regclass AND tgname='guard_new_reservation_event_alias') THEN
   RAISE EXCEPTION '旧公演参照ガードの名前が競合しています';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c
   WHERE c.conrelid='public.reservations'::regclass AND c.conname='reservations_event_id_fkey'
   AND c.contype='f' AND c.confrelid='public.schedule_events'::regclass
   AND c.confdeltype='a' AND c.confupdtype='a' AND NOT c.condeferrable
   AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='event_id')]::smallint[]
   AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
   OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.reservations'::regclass AND attname='event_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped)
   OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.reservations'::regclass AND conname='reservations_event_organization_fkey') THEN
   RAISE EXCEPTION '旧FKまたは先行E1の参照契約が想定と異なります';
 END IF;
END $$;
-- 旧列の新規導入だけを検査する。既存履歴や正本だけの変更を補正しない。
CREATE FUNCTION public.guard_new_reservation_event_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $function$
DECLARE
  event_organization uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.schedule_event_id IS NULL OR NEW.schedule_event_id <> NEW.event_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = '旧公演参照の新規設定には正本公演との一致が必要です';
  END IF;
  SELECT organization_id INTO event_organization
    FROM public.schedule_events WHERE id = NEW.event_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = '参照先公演が存在しません';
  END IF;
  IF NEW.organization_id IS NULL OR event_organization IS NULL
      OR NEW.organization_id <> event_organization THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = '旧公演参照の新規設定には同一組織が必要です';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_new_reservation_event_alias() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_new_reservation_event_alias
  BEFORE INSERT OR UPDATE OF event_id ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_new_reservation_event_alias();
COMMIT;
