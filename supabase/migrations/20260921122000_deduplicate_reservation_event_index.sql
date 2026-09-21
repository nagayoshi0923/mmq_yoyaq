-- Both indexes are plain btree(schedule_event_id), with no constraint dependency.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index a JOIN pg_index b ON a.indrelid=b.indrelid
    WHERE a.indexrelid='public.idx_reservations_schedule_event_id'::regclass
      AND b.indexrelid='public.idx_reservations_event'::regclass
      AND a.indkey=b.indkey AND a.indclass=b.indclass AND a.indcollation=b.indcollation
      AND a.indoption=b.indoption AND a.indisunique=b.indisunique
      AND a.indnkeyatts=b.indnkeyatts AND a.indnatts=b.indnatts
      AND a.indpred IS NOT DISTINCT FROM b.indpred
      AND a.indexprs IS NOT DISTINCT FROM b.indexprs
      AND a.indisvalid AND b.indisvalid
  ) THEN RAISE EXCEPTION 'reservation index definitions differ; refusing removal'; END IF;
END $$;
DROP INDEX public.idx_reservations_event;
COMMIT;
