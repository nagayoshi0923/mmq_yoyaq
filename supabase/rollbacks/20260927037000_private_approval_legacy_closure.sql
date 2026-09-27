-- Restore the actual pre-migration ACL, including its existing PUBLIC grant.
GRANT EXECUTE ON FUNCTION public.approve_private_booking(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) TO PUBLIC,anon,authenticated;
