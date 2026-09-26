BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.business_hours_settings ADD CONSTRAINT business_hours_settings_store_id_unique UNIQUE (store_id);
ALTER TABLE public.gm_availability_responses ADD CONSTRAINT gm_availability_responses_reservation_staff_unique UNIQUE (reservation_id, staff_id);
NOTIFY pgrst, 'reload schema';
COMMIT;
