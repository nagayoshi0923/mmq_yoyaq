-- 今回追加した2FK/2indexだけを撤去。履歴・旧FK・A〜M1の保証は保持する。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.schedule_events'::regclass
      AND conname = 'schedule_events_store_organization_fkey'
      AND pg_get_constraintdef(oid) = 'FOREIGN KEY (store_id, organization_id) REFERENCES stores(id, organization_id) ON DELETE RESTRICT NOT VALID')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.reservations'::regclass
      AND conname = 'reservations_event_organization_fkey'
      AND pg_get_constraintdef(oid) = 'FOREIGN KEY (schedule_event_id, organization_id) REFERENCES schedule_events(id, organization_id) ON DELETE SET NULL (schedule_event_id) NOT VALID') THEN
    RAISE EXCEPTION '組織参照の復元対象が想定と異なる';
  END IF;
END $$;
ALTER TABLE public.reservations DROP CONSTRAINT reservations_event_organization_fkey;
ALTER TABLE public.schedule_events DROP CONSTRAINT schedule_events_store_organization_fkey;
DROP INDEX public.schedule_events_id_organization_id_key;
DROP INDEX public.stores_id_organization_id_key;
-- CASCADEは使わない。追加の依存があればtransactionを止める。
COMMIT;
