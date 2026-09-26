CREATE OR REPLACE FUNCTION public.recruitment_missing_limit(p_minimum integer,p_mode text,p_value integer)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$
 SELECT CASE WHEN p_mode='percent' AND p_value BETWEEN 1 AND 100 THEN floor(GREATEST(p_minimum,1)::numeric*p_value/100)::integer
 WHEN p_mode='count' AND p_value BETWEEN 1 AND 20 THEN p_value ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.recruitment_missing_limit(integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_missing_limit(integer,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.save_organization_recruitment_settings(p_organization_id uuid,p_actor_id uuid,p_mode text,p_value integer,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s organization_recruitment_settings%ROWTYPE; before_value jsonb; after_value jsonb;
BEGIN
 IF p_actor_id IS NULL OR recruitment_missing_limit(7,p_mode,p_value) IS NULL THEN RETURN jsonb_build_object('success',false,'error','INVALID_SETTINGS'); END IF;
 -- 初回作成も直列化し、空の設定に対する同時保存を防ぐ。
 PERFORM 1 FROM organizations WHERE id=p_organization_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','NOT_FOUND'); END IF;
 SELECT * INTO s FROM organization_recruitment_settings WHERE organization_id=p_organization_id FOR UPDATE;
 IF s.updated_at IS DISTINCT FROM p_expected_updated_at THEN RETURN jsonb_build_object('success',false,'error','CONFLICT'); END IF;
 before_value:=jsonb_build_object('mode',COALESCE(s.mode,'count'),'value',COALESCE(s.value,2));
 after_value:=jsonb_build_object('mode',p_mode,'value',p_value);
 IF before_value=after_value AND s.organization_id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
 INSERT INTO organization_recruitment_settings(organization_id,mode,value) VALUES(p_organization_id,p_mode,p_value)
 ON CONFLICT(organization_id) DO UPDATE SET mode=excluded.mode,value=excluded.value,updated_at=clock_timestamp();
 INSERT INTO organization_recruitment_setting_history(organization_id,actor_id,before_settings,after_settings) VALUES(p_organization_id,p_actor_id,before_value,after_value);
 RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION public.save_organization_recruitment_settings(uuid,uuid,text,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_organization_recruitment_settings(uuid,uuid,text,integer,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.save_scenario_recruitment_settings_v2(p_organization_id uuid,p_master_id uuid,p_actor_id uuid,p_enabled boolean,p_source text,p_mode text,p_value integer,p_deadline_minutes integer,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.save_scenario_recruitment_settings_v3(p_organization_id,p_master_id,p_actor_id,p_enabled,p_source,p_mode,p_value,p_deadline_minutes,p_expected_updated_at,'custom','custom');
$$;
REVOKE ALL ON FUNCTION public.save_scenario_recruitment_settings_v2(uuid,uuid,uuid,boolean,text,text,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_scenario_recruitment_settings_v2(uuid,uuid,uuid,boolean,text,text,integer,integer,timestamptz) TO service_role;

-- 配備前のクライアントによる固定人数の保存も、個別指定として整合させる。
CREATE OR REPLACE FUNCTION public.save_scenario_recruitment_settings(p_organization_id uuid,p_master_id uuid,p_actor_id uuid,p_enabled boolean,p_max_missing integer,p_deadline_minutes integer,p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.save_scenario_recruitment_settings_v2(p_organization_id,p_master_id,p_actor_id,p_enabled,'custom','count',p_max_missing,p_deadline_minutes,p_expected_updated_at);
$$;
REVOKE ALL ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_scenario_recruitment_settings(uuid,uuid,uuid,boolean,integer,integer,timestamptz) TO service_role;
