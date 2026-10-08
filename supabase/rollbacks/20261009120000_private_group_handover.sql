-- 20261009120000 の取り消し: 主催者の引き継ぎの関数と表を消し、private_group_read_snapshot を直前（handover 無し）へ戻す
-- 注意: 表を消すと依頼の記録（同意の記録・旧申込者）も消える。成立済みの引き継ぎ（主催者・予約の申込者）は戻らない
BEGIN;
CREATE OR REPLACE FUNCTION public.private_group_read_snapshot(p_group_id uuid DEFAULT NULL::uuid, p_invite_code text DEFAULT NULL::text, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; access_level text; invited boolean:=false;
 result jsonb; members jsonb:='[]'; dates jsonb:='[]'; scenario jsonb; actor_member uuid;
 reservation_status text; confirmed_name text; confirmed_performance jsonb; linked_reservation jsonb;
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
   'guest_name',CASE WHEN m.user_id IS NULL THEN m.guest_name ELSE COALESCE((SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),'ニックネーム未設定') END,
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
  -- 申込内容の箱（グループ画面の右パネル）用。お客様情報・金額は含めず、予約番号・申込日時・人数・申込時の候補日・希望店舗名だけを返す。
  SELECT jsonb_build_object(
    'reservation_number',r.reservation_number,'requested_at',r.created_at,'participant_count',r.participant_count,
    'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',c->>'date','startTime',c->>'startTime','endTime',c->>'endTime','timeSlot',c->>'timeSlot') ORDER BY ord)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.candidate_datetimes->'candidates')='array' THEN r.candidate_datetimes->'candidates' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c,ord)),'[]'::jsonb),
    'requested_store_names',COALESCE((SELECT jsonb_agg(st->>'storeName' ORDER BY ord)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.candidate_datetimes->'requestedStores')='array' THEN r.candidate_datetimes->'requestedStores' ELSE '[]'::jsonb END) WITH ORDINALITY AS u(st,ord)
      WHERE nullif(st->>'storeName','') IS NOT NULL),'[]'::jsonb))
  INTO linked_reservation
  FROM public.reservations r WHERE r.id=g.reservation_id AND r.organization_id=g.organization_id AND r.status IS DISTINCT FROM 'cancelled';
  -- Only authorized members/staff receive the current confirmed performance.
  -- Proposed candidate rows remain immutable history for availability answers.
  SELECT jsonb_build_object('id',e.id,'date',e.date,'start_time',e.start_time,'end_time',e.end_time,
    'store_name',COALESCE(s.name,e.venue)) INTO confirmed_performance
  FROM public.reservations r JOIN public.schedule_events e ON e.id=r.schedule_event_id AND e.organization_id=g.organization_id
  LEFT JOIN public.stores s ON s.id=e.store_id AND s.organization_id=g.organization_id
  WHERE r.id=g.reservation_id AND r.organization_id=g.organization_id
    AND r.status IN ('confirmed','checked_in','completed','no_show') AND NOT COALESCE(e.is_cancelled,false);
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
  -- 幹事本人の最小表示名（ニックネーム→氏名→ゲスト名）。招待リンクを開いた人（preview）にも
  -- 「○○さんからのお誘い」を出すため、全アクセス段階で返す。顧客プロフィールは共通(NULL組織)もあるため所属では絞らない。
  'organizer_display_name',COALESCE((
    SELECT COALESCE(NULLIF(c.nickname,''),NULLIF(c.name,''))
    FROM public.customers c WHERE c.user_id=g.organizer_id
    ORDER BY c.id LIMIT 1
  ),(
    SELECT NULLIF(m.guest_name,'') FROM public.private_group_members m
    WHERE m.group_id=g.id AND m.user_id=g.organizer_id
    ORDER BY m.is_organizer DESC NULLS LAST,m.id LIMIT 1
  )),
  'name',g.name,'invite_code',g.invite_code,'status',g.status,
  'joined_member_count',(SELECT count(*) FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined'),
  'reservation_id',CASE WHEN access_level<>'preview' THEN g.reservation_id END,'target_participant_count',g.target_participant_count,'preferred_store_ids',g.preferred_store_ids,
  'notes',CASE WHEN access_level IN ('staff','organizer') THEN g.notes END,'created_at',g.created_at,'updated_at',g.updated_at,
  'total_price',g.total_price,'per_person_price',g.per_person_price,
  'character_assignments',CASE WHEN access_level<>'preview' THEN g.character_assignments END,
  'character_assignment_method',CASE WHEN access_level<>'preview' THEN g.character_assignment_method END,
  'scenario_masters',scenario,'members',members,'candidate_dates',dates,'confirmed_performance',confirmed_performance,'confirmed_performance_access',CASE WHEN access_level='preview' THEN 'preview' ELSE 'authorized' END);
 RETURN jsonb_build_object('group',result,'access_level',access_level,'current_member_id',actor_member,'linked_reservation_status',reservation_status,'confirmed_by_name',confirmed_name,'linked_reservation',linked_reservation);
END $function$;
DROP FUNCTION IF EXISTS public.private_group_handover_mine();
DROP FUNCTION IF EXISTS public.private_group_handover_detail(uuid);
DROP FUNCTION IF EXISTS public.private_group_handover_accept(uuid,uuid,text,text,jsonb);
DROP FUNCTION IF EXISTS public.private_group_handover_decline(uuid);
DROP FUNCTION IF EXISTS public.private_group_handover_cancel(uuid);
DROP FUNCTION IF EXISTS public.private_group_handover_request(uuid,uuid);
DROP FUNCTION IF EXISTS public.private_group_handover_settle(uuid);
DROP FUNCTION IF EXISTS public.private_group_handover_close(uuid,text);
DROP FUNCTION IF EXISTS public.private_group_handover_user_name(uuid,uuid);
DROP TABLE IF EXISTS public.private_group_handover_requests;
COMMIT;
