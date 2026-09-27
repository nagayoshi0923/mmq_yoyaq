-- Apply after every approval screen uses the transactional notification wrapper.
-- The SECURITY DEFINER owner and service role retain internal access.
REVOKE EXECUTE ON FUNCTION public.approve_private_booking(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
