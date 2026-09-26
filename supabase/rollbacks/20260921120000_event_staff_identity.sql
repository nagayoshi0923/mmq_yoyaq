-- First redeploy the previous application version (name-based salary reader).
-- This removes only the new relation; all legacy event names/roles remain intact.
BEGIN;
DROP TRIGGER rename_event_staff_identity ON public.staff;
DROP TRIGGER sync_event_staff_identity ON public.schedule_events;
DROP FUNCTION public.rename_event_staff_identity();
DROP FUNCTION public.sync_event_staff_identity();
DROP TABLE public.schedule_event_staff_assignments;
NOTIFY pgrst,'reload schema';
COMMIT;
