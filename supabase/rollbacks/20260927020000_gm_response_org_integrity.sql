BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.gm_availability_responses DROP CONSTRAINT gm_responses_staff_org_fkey;
ALTER TABLE public.gm_availability_responses DROP CONSTRAINT gm_responses_reservation_org_fkey;
DROP INDEX public.staff_id_organization_id_key;
DROP INDEX public.reservations_id_organization_id_key;
NOTIFY pgrst, 'reload schema';
COMMIT;
