-- Restore the previous API first, then remove the new endpoint.
DROP FUNCTION IF EXISTS public.search_org_customers(uuid,text,integer,integer,text,text,integer,integer,bigint,boolean,date,date);
