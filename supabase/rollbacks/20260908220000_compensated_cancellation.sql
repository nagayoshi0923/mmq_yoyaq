-- Keep cancellation/compensation/audit data; stop new integrated operations.
REVOKE EXECUTE ON FUNCTION public.compensated_cancellation(uuid,boolean,jsonb,text,jsonb) FROM authenticated;
