-- Browser access now uses authorized SECURITY DEFINER RPCs (through PR624).
-- Preserve rows, RLS, function ACLs and service_role. Save exact previous browser ACLs.
CREATE FUNCTION public.private_group_access_rollback_20260927() RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RETURN; END $$;
REVOKE ALL ON FUNCTION public.private_group_access_rollback_20260927() FROM PUBLIC,anon,authenticated,service_role;
DO $migration$
DECLARE item record; saved jsonb; target text;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'column',a.column_name,'role',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'privilege',x.privilege_type,'grantable',x.is_grantable)),'[]'::jsonb)
 INTO saved
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN LATERAL (
  SELECT NULL::text column_name,coalesce(c.relacl,acldefault('r',c.relowner)) acl
  UNION ALL SELECT attname,attacl FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL
 ) a CROSS JOIN LATERAL aclexplode(a.acl) x
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['private_groups','private_group_members','private_group_candidate_dates','private_group_date_responses','private_group_messages','private_group_survey_responses','org_scenario_survey_questions','private_group_invitations'])
 AND (x.grantee=0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated'));
 EXECUTE format('COMMENT ON FUNCTION public.private_group_access_rollback_20260927() IS %L',saved::text);
 FOREACH target IN ARRAY ARRAY['private_groups','private_group_members','private_group_candidate_dates','private_group_date_responses','private_group_messages','private_group_survey_responses','org_scenario_survey_questions','private_group_invitations'] LOOP
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC,anon,authenticated',target);
  FOR item IN SELECT attname FROM pg_attribute WHERE attrelid=format('public.%I',target)::regclass AND attnum>0 AND NOT attisdropped LOOP
   EXECUTE format('REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.%2$I FROM PUBLIC,anon,authenticated',item.attname,target);
  END LOOP;
 END LOOP;
END
$migration$;
NOTIFY pgrst,'reload schema';
