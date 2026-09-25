CREATE OR REPLACE FUNCTION public.freeze_private_group_survey_deadline(p_organization_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings jsonb;
BEGIN
 PERFORM 1 FROM private_groups WHERE id=p_group_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'group not found' USING ERRCODE='42501'; END IF;
 settings:=public.get_private_group_survey_settings(p_organization_id,p_group_id);
 IF (settings->>'survey_enabled')::boolean AND settings->>'survey_deadline_at' IS NOT NULL THEN
   INSERT INTO private_group_survey_deadlines(group_id,organization_id,deadline_at)
   VALUES(p_group_id,p_organization_id,(settings->>'survey_deadline_at')::timestamptz)
   ON CONFLICT(group_id) DO NOTHING;
 END IF;
 RETURN public.get_private_group_survey_settings(p_organization_id,p_group_id);
END $$;
REVOKE ALL ON FUNCTION public.freeze_private_group_survey_deadline(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_private_group_survey_deadline(uuid,uuid) TO service_role;
