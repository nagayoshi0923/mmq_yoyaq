CREATE OR REPLACE FUNCTION public.private_group_read_snapshot(p_group_id uuid DEFAULT NULL::uuid, p_invite_code text DEFAULT NULL::text, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  'organizer_id',CASE WHEN access_level<>'preview' THEN g.organizer_id END,
  -- グループの同組織スタッフ認可後に、幹事本人の最小表示名だけを返す。
  -- 顧客プロフィールは共通(NULL組織)もあるため所属では絞らない。
  'organizer_display_name',CASE WHEN access_level='staff' THEN COALESCE((
    SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,''))
    FROM public.customers c WHERE c.user_id=g.organizer_id
    ORDER BY c.id LIMIT 1
  ),(
    SELECT NULLIF(m.guest_name,'') FROM public.private_group_members m
    WHERE m.group_id=g.id AND m.user_id=g.organizer_id
    ORDER BY m.is_organizer DESC NULLS LAST,m.id LIMIT 1
  )) END,
  'name',g.name,'invite_code',g.invite_code,'status',g.status,
  'reservation_id',CASE WHEN access_level<>'preview' THEN g.reservation_id END,'target_participant_count',g.target_participant_count,'preferred_store_ids',g.preferred_store_ids,
  'notes',CASE WHEN access_level IN ('staff','organizer') THEN g.notes END,'created_at',g.created_at,'updated_at',g.updated_at,
  'total_price',g.total_price,'per_person_price',g.per_person_price,
  'character_assignments',CASE WHEN access_level<>'preview' THEN g.character_assignments END,
  'character_assignment_method',CASE WHEN access_level<>'preview' THEN g.character_assignment_method END,
  'scenario_masters',scenario,'members',members,'candidate_dates',dates);
 RETURN jsonb_build_object('group',result,'access_level',access_level,'current_member_id',actor_member,'linked_reservation_status',reservation_status,'confirmed_by_name',confirmed_name);
END $function$;
