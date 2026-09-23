-- 配備前のクライアントによる固定人数の保存も、個別指定として整合させる。
CREATE OR REPLACE FUNCTION public.save_scenario_recruitment_settings(p_organization_id uuid,p_master_id uuid,p_actor_id uuid,p_enabled boolean,p_max_missing integer,p_deadline_minutes integer,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.save_scenario_recruitment_settings_v2(p_organization_id,p_master_id,p_actor_id,p_enabled,'custom','count',p_max_missing,p_deadline_minutes,p_expected_updated_at);
$$;
REVOKE ALL ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) TO service_role;
