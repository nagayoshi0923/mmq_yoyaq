BEGIN;
ALTER TABLE public.schedule_events ALTER COLUMN gm_cost SET DEFAULT 0;
COMMENT ON COLUMN public.schedule_events.gm_cost IS NULL;
COMMIT;
