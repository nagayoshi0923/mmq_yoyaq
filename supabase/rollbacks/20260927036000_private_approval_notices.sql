-- Roll back the frontend to the original approval RPC before removing this entry.
DROP FUNCTION IF EXISTS public.approve_private_booking_with_notice(uuid,date,time,time,uuid,uuid,jsonb,text,text,uuid);
