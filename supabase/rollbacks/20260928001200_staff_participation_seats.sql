-- Before production rollback, export the explicit bindings; never discard existing linkage data.
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.event_staff_participations) THEN RAISE EXCEPTION 'スタッフ参加記録を退避してから復元してください'; END IF; END $$;
DROP FUNCTION public.sync_event_staff_participations(uuid,jsonb,jsonb,text[],jsonb,jsonb);
DROP FUNCTION public.get_event_staff_participations(uuid);
DROP TABLE public.event_staff_participations;
NOTIFY pgrst, 'reload schema';
COMMIT;
