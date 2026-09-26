BEGIN;
SET LOCAL lock_timeout='5s';
CREATE INDEX idx_reservations_event ON public.reservations USING btree(schedule_event_id);
COMMIT;
