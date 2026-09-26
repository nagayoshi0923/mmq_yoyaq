-- QW-20260917-001 A04: either the complete invitation group is created, or nothing is.
CREATE FUNCTION public.create_private_group_atomic(
 p_organization_id uuid,p_scenario_master_id uuid,p_name text DEFAULT NULL,
 p_preferred_store_ids uuid[] DEFAULT '{}',p_candidate_dates jsonb DEFAULT '[]',p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE
 v_user uuid:=auth.uid(); v_group public.private_groups; v_member uuid;
 v_name text; v_settings public.global_settings; v_date jsonb; v_order bigint;
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM organizations WHERE id=p_organization_id AND is_active IS TRUE) THEN
  RAISE EXCEPTION '組織情報が取得できません' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization_scenarios_with_master
   WHERE organization_id=p_organization_id AND scenario_master_id=p_scenario_master_id
   AND player_count_min>=1 AND player_count_max>=player_count_min AND accepts_private_booking IS TRUE) THEN
  RAISE EXCEPTION 'この作品は現在貸切を受け付けていません' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_preferred_store_ids,'{}')) s(id)
   WHERE NOT EXISTS(SELECT 1 FROM stores WHERE stores.id=s.id AND organization_id=p_organization_id AND status='active')) THEN
  RAISE EXCEPTION '選択した店舗はこの組織で利用できません' USING ERRCODE='22023';
 END IF;
 IF p_candidate_dates IS NULL OR jsonb_typeof(p_candidate_dates)<>'array' THEN
  RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_candidate_dates)>100 OR length(coalesce(p_name,''))>200 OR length(coalesce(p_notes,''))>10000 THEN
  RAISE EXCEPTION '入力が長すぎます' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(nullif(nickname,''),nullif(name,'')) INTO v_name FROM customers WHERE user_id=v_user ORDER BY id LIMIT 1;
 SELECT * INTO v_settings FROM global_settings WHERE organization_id=p_organization_id LIMIT 1;
 INSERT INTO private_groups(organization_id,scenario_master_id,organizer_id,name,invite_code,status,preferred_store_ids,notes)
 VALUES(p_organization_id,p_scenario_master_id,v_user,nullif(trim(p_name),''),encode(extensions.gen_random_bytes(16),'hex'),'gathering',coalesce(p_preferred_store_ids,'{}'),p_notes)
 RETURNING * INTO v_group;
 INSERT INTO private_group_members(group_id,user_id,guest_name,is_organizer,status,joined_at)
 VALUES(v_group.id,v_user,coalesce(v_name,'主催者'),true,'joined',clock_timestamp()) RETURNING id INTO v_member;
 FOR v_date,v_order IN SELECT value,ordinality FROM jsonb_array_elements(p_candidate_dates) WITH ORDINALITY LOOP
  IF jsonb_typeof(v_date)<>'object' OR coalesce(v_date->>'time_slot','') NOT IN ('午前','午後','夜間')
    OR coalesce(v_date->>'start_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    OR coalesce(v_date->>'end_time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
   RAISE EXCEPTION '候補日時の形式が不正です' USING ERRCODE='22023';
  END IF;
  INSERT INTO private_group_candidate_dates(group_id,date,time_slot,start_time,end_time,order_num)
  VALUES(v_group.id,(v_date->>'date')::date,v_date->>'time_slot',v_date->>'start_time',v_date->>'end_time',coalesce((v_date->>'order_num')::integer,v_order::integer));
 END LOOP;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(v_group.id,v_member,jsonb_build_object(
  'type','system','action','group_created','organizerName',coalesce(v_name,'主催者'),
  'title',coalesce(nullif(v_settings.system_msg_group_created_title,''),'貸切リクエストグループを作成しました'),
  'body',coalesce(nullif(v_settings.system_msg_group_created_body,''),'招待リンクを共有して、参加メンバーを招待してください。'),
  'note',coalesce(nullif(v_settings.system_msg_group_created_note,''),'※ 全員を招待していなくても日程確定は可能ですが、当日は参加人数全員でお越しください。'))::text);
 RETURN to_jsonb(v_group);
END $$;
REVOKE ALL ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text) TO authenticated,service_role;
