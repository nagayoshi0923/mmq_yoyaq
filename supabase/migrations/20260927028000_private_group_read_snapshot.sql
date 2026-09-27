-- Phase 1 read endpoints. Raw table grants remain until every caller migrates.
CREATE FUNCTION public.private_group_read_snapshot(
 p_group_id uuid DEFAULT NULL,p_invite_code text DEFAULT NULL,
 p_member_id uuid DEFAULT NULL,p_guest_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g public.private_groups%ROWTYPE; access_level text; invited boolean:=false;
 result jsonb; members jsonb:='[]'; dates jsonb:='[]'; scenario jsonb; actor_member uuid;
 reservation_status text; confirmed_name text;
BEGIN
 IF p_invite_code IS NOT NULL THEN
  SELECT * INTO g FROM public.private_groups WHERE invite_code=p_invite_code AND (p_group_id IS NULL OR id=p_group_id);
  invited:=FOUND;
 ELSE
  SELECT * INTO g FROM public.private_groups WHERE id=p_group_id;
 END IF;
 IF g.id IS NULL THEN RAISE EXCEPTION 'グループを閲覧できません' USING ERRCODE='42501'; END IF;
 BEGIN
  access_level:=public.authorize_private_group_read(g.id,p_member_id,p_guest_token);
 EXCEPTION WHEN insufficient_privilege THEN
  IF NOT invited THEN RAISE; END IF;
  access_level:='preview';
 END;
 IF access_level<>'preview' THEN
  SELECT id INTO actor_member FROM public.private_group_members
   WHERE group_id=g.id AND status='joined'
   AND auth.uid() IS NOT NULL AND user_id=auth.uid()
   ORDER BY id LIMIT 1;
  IF actor_member IS NULL AND p_member_id IS NOT NULL THEN
   BEGIN
    PERFORM public.require_private_group_member(g.id,p_member_id,p_guest_token);
    actor_member:=p_member_id;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',m.id,'group_id',m.group_id,'user_id',m.user_id,
   'guest_name',CASE WHEN m.user_id IS NULL THEN m.guest_name ELSE COALESCE((SELECT NULLIF(c.nickname,'') FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END,
   'staff_display_name',CASE WHEN access_level='staff' THEN COALESCE((SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),m.guest_name,'参加者') END,
   'guest_email',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.guest_email END,
   'guest_phone',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.guest_phone END,
   'is_organizer',m.is_organizer,'status',m.status,'joined_at',m.joined_at,'created_at',m.created_at,
   'coupon_id',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.coupon_id END,
   'payment_amount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.payment_amount END,
   'coupon_discount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.coupon_discount END,
   'final_amount',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.final_amount END,
   'payment_status',CASE WHEN access_level IN ('staff','organizer') OR m.id=actor_member THEN m.payment_status END,
   'date_responses',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.private_group_date_responses r WHERE r.group_id=g.id AND r.member_id=m.id),'[]'::jsonb)
  ) ORDER BY m.joined_at,m.id),'[]'::jsonb) INTO members FROM public.private_group_members m WHERE m.group_id=g.id;
  SELECT r.status,s.name INTO reservation_status,confirmed_name FROM public.reservations r LEFT JOIN public.staff s ON s.id=r.confirmed_by AND s.organization_id=g.organization_id WHERE r.id=g.reservation_id AND r.organization_id=g.organization_id;
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(d)||jsonb_build_object('responses',CASE WHEN access_level='preview' THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.private_group_date_responses r WHERE r.group_id=g.id AND r.candidate_date_id=d.id),'[]'::jsonb) END) ORDER BY d.order_num,d.id),'[]'::jsonb)
 INTO dates FROM public.private_group_candidate_dates d WHERE d.group_id=g.id;
 SELECT jsonb_build_object('id',s.id,'title',s.title,'key_visual_url',s.key_visual_url,'player_count_min',s.player_count_min,'player_count_max',s.player_count_max) INTO scenario FROM public.scenario_masters s WHERE s.id=g.scenario_master_id;
 IF scenario IS NOT NULL THEN
  SELECT scenario||jsonb_build_object('characters',CASE WHEN access_level='preview' THEN NULL ELSE v.characters END,'effective_player_count_min',v.player_count_min,'effective_player_count_max',v.player_count_max,'survey_enabled',COALESCE(v.survey_enabled,false)) INTO result FROM public.organization_scenarios_with_master v WHERE v.organization_id=g.organization_id AND v.scenario_master_id=g.scenario_master_id;
  scenario:=COALESCE(result,scenario);
 END IF;
 result:=jsonb_build_object('id',g.id,'organization_id',g.organization_id,'scenario_master_id',g.scenario_master_id,
  'organizer_id',CASE WHEN access_level<>'preview' THEN g.organizer_id END,'name',g.name,'invite_code',g.invite_code,'status',g.status,
  'reservation_id',CASE WHEN access_level<>'preview' THEN g.reservation_id END,'target_participant_count',g.target_participant_count,'preferred_store_ids',g.preferred_store_ids,
  'notes',CASE WHEN access_level IN ('staff','organizer') THEN g.notes END,'created_at',g.created_at,'updated_at',g.updated_at,
  'total_price',g.total_price,'per_person_price',g.per_person_price,
  'character_assignments',CASE WHEN access_level<>'preview' THEN g.character_assignments END,
  'character_assignment_method',CASE WHEN access_level<>'preview' THEN g.character_assignment_method END,
  'scenario_masters',scenario,'members',members,'candidate_dates',dates);
 RETURN jsonb_build_object('group',result,'access_level',access_level,'current_member_id',actor_member,'linked_reservation_status',reservation_status,'confirmed_by_name',confirmed_name);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_snapshot(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_snapshot(uuid,text,uuid,text) TO anon,authenticated,service_role;

CREATE FUNCTION public.private_group_read_messages(p_group_id uuid,p_member_id uuid DEFAULT NULL,p_guest_token text DEFAULT NULL,p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION '履歴の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id) FROM (
  SELECT id,group_id,member_id,message,created_at,sender_type FROM public.private_group_messages WHERE group_id=p_group_id AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;

-- UUIDカーソルで全件を辿り、PostgRESTの既定件数制限で一覧を欠落させない。
CREATE FUNCTION public.private_group_read_list(
 p_scope text DEFAULT 'joined',p_organization_id uuid DEFAULT NULL,p_after_id uuid DEFAULT NULL,p_limit integer DEFAULT 100,p_group_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('joined','organized','staff') OR p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
  RAISE EXCEPTION '一覧の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 IF p_scope='staff' THEN
  SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
  IF p_organization_id IS NULL OR NOT (
   COALESCE(actor_role='license_admin',false) OR
   (COALESCE(actor_role IN ('admin','staff') AND actor_org=p_organization_id,false)
    AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
     AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))))
  ) THEN RAISE EXCEPTION 'この組織の一覧を閲覧できません' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(public.private_group_read_snapshot(g.id)->'group' ORDER BY g.id) FROM (
  SELECT id FROM public.private_groups pg WHERE (p_after_id IS NULL OR pg.id>p_after_id)
   AND (p_organization_id IS NULL OR pg.organization_id=p_organization_id)
   AND (p_group_ids IS NULL OR pg.id=ANY(p_group_ids))
   AND (p_scope='staff' OR (p_scope='organized' AND pg.organizer_id=actor)
    OR (p_scope='joined' AND EXISTS(SELECT 1 FROM public.private_group_members m WHERE m.group_id=pg.id AND m.user_id=actor AND m.status='joined')))
  ORDER BY pg.id LIMIT p_limit
 ) g),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_list(text,uuid,uuid,integer,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_read_list(text,uuid,uuid,integer,uuid[]) TO authenticated,service_role;

CREATE FUNCTION public.private_group_read_reservation(p_reservation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT g.id INTO STRICT target FROM public.private_groups g
 JOIN public.reservations r ON r.id=g.reservation_id AND r.organization_id=g.organization_id
 WHERE r.id=p_reservation_id;
 RETURN public.private_group_read_snapshot(target);
EXCEPTION WHEN no_data_found THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_reservation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_read_reservation(uuid) TO authenticated,service_role;

CREATE FUNCTION public.private_group_read_survey_responses(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF public.authorize_private_group_read(p_group_id)<>'staff' THEN
  RAISE EXCEPTION 'アンケート一覧を閲覧できません' USING ERRCODE='42501';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.submitted_at,r.member_id) FROM (
  SELECT s.member_id,s.responses,s.submitted_at FROM public.private_group_survey_responses s
  JOIN public.private_group_members m ON m.id=s.member_id AND m.group_id=s.group_id
  WHERE s.group_id=p_group_id
 ) r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_survey_responses(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_read_survey_responses(uuid) TO authenticated,service_role;
