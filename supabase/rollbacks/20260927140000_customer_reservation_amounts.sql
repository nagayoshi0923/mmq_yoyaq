-- Roll back the API/frontend before removing the new projection. No business rows are changed.
DROP FUNCTION IF EXISTS public.get_org_customers_with_stats_v2(uuid,text,integer,integer);
