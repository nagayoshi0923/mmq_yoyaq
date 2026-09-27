-- Restore the exact table/column browser privileges captured in this environment.
DO $rollback$
DECLARE saved jsonb; item jsonb; target_role text; column_sql text;
BEGIN
 IF to_regprocedure('public.private_group_access_rollback_20260927()') IS NULL THEN
  RAISE EXCEPTION 'private group ACL rollback snapshot is missing';
 END IF;
 saved:=obj_description('public.private_group_access_rollback_20260927()'::regprocedure,'pg_proc')::jsonb;
 IF saved IS NULL OR jsonb_typeof(saved)<>'array' THEN RAISE EXCEPTION 'invalid private group ACL snapshot'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(saved) LOOP
  target_role:=CASE WHEN item->>'role'='PUBLIC' THEN 'PUBLIC' ELSE quote_ident(item->>'role') END;
  column_sql:=CASE WHEN item->>'column' IS NULL THEN '' ELSE format(' (%I)',item->>'column') END;
  EXECUTE format('GRANT %s%s ON TABLE public.%I TO %s%s',item->>'privilege',column_sql,item->>'table',target_role,CASE WHEN (item->>'grantable')::boolean THEN ' WITH GRANT OPTION' ELSE '' END);
 END LOOP;
END
$rollback$;
DROP FUNCTION public.private_group_access_rollback_20260927();
NOTIFY pgrst,'reload schema';
