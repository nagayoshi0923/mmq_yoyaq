-- 既存Astra計画E/R10。既存値は補正せず、新規・参照変更と親側変更をDBで保証する。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'schedule_events_store_id_fkey'
      AND c.conrelid = 'public.schedule_events'::regclass
      AND c.confrelid = 'public.stores'::regclass AND c.contype = 'f'
      AND c.confdeltype = 'r' AND c.confupdtype = 'a' AND NOT c.condeferrable
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'store_id')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.confrelid AND attname = 'id')]::smallint[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'reservations_schedule_event_id_fkey'
      AND c.conrelid = 'public.reservations'::regclass
      AND c.confrelid = 'public.schedule_events'::regclass AND c.contype = 'f'
      AND c.confdeltype = 'n' AND c.confupdtype = 'a' AND NOT c.condeferrable
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'schedule_event_id')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = c.confrelid AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION '組織参照の既存削除契約が想定と異なる';
  END IF;
  IF to_regclass('public.stores_id_organization_id_key') IS NOT NULL
    OR to_regclass('public.schedule_events_id_organization_id_key') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN (
      'schedule_events_store_organization_fkey', 'reservations_event_organization_fkey'
    ) AND connamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '組織参照候補が適用済み、または名前が競合している';
  END IF;
END $$;

CREATE UNIQUE INDEX stores_id_organization_id_key ON public.stores(id, organization_id);
CREATE UNIQUE INDEX schedule_events_id_organization_id_key ON public.schedule_events(id, organization_id);
ALTER TABLE public.schedule_events
  ADD CONSTRAINT schedule_events_store_organization_fkey
  FOREIGN KEY (store_id, organization_id) REFERENCES public.stores(id, organization_id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_event_organization_fkey
  FOREIGN KEY (schedule_event_id, organization_id) REFERENCES public.schedule_events(id, organization_id)
  ON DELETE SET NULL (schedule_event_id) NOT VALID;
-- 元の単列FKを保持する。MATCH SIMPLEでNULLリンクを許可し、orgは削除時も残す。
-- VALIDATE、UPDATE/backfill、GRANT/REVOKE/RLSの変更はこの候補に含めない。
COMMIT;
