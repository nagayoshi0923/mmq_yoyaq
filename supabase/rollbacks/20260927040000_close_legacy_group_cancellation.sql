-- 適用前の実ACLはPUBLIC/anon/authenticatedにもEXECUTEがある。
BEGIN;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_and_group_with_lock(uuid,uuid,text) TO PUBLIC,anon,authenticated;
COMMIT;
