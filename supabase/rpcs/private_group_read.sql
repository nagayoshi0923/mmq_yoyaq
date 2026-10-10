-- Phase 1 read endpoints. Raw table grants remain until every caller migrates.
CREATE OR REPLACE FUNCTION public.private_group_read_snapshot(p_group_id uuid DEFAULT NULL::uuid, p_invite_code text DEFAULT NULL::text, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE g public.private_groups%ROWTYPE; access_level text; invited boolean:=false;
 result jsonb; members jsonb:='[]'; dates jsonb:='[]'; scenario jsonb; actor_member uuid;
 reservation_status text; confirmed_name text; confirmed_performance jsonb; linked_reservation jsonb; handover jsonb;
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
  -- 進行中の主催者の引き継ぎ依頼（段階 3）。期限切れなどは読み取り時に状態を寄せる。当事者と同組織スタッフだけに返す
  PERFORM public.private_group_handover_settle(g.id);
  SELECT jsonb_build_object('id',h.id,'status',h.status,'from_member_id',h.from_member_id,'to_member_id',h.to_member_id,
    'from_name',public.private_group_handover_user_name(h.from_user_id,g.id),'to_name',public.private_group_handover_user_name(h.to_user_id,g.id),
    'requested_at',h.requested_at,'expires_at',h.expires_at,
    'is_recipient',auth.uid() IS NOT NULL AND h.to_user_id=auth.uid(),'is_requester',auth.uid() IS NOT NULL AND h.from_user_id=auth.uid())
  INTO handover FROM public.private_group_handover_requests h
  WHERE h.group_id=g.id AND h.status='requested'
    AND (access_level='staff' OR (auth.uid() IS NOT NULL AND auth.uid() IN (h.from_user_id,h.to_user_id)));
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
 RETURN jsonb_build_object('group',result,'access_level',access_level,'current_member_id',actor_member,'linked_reservation_status',reservation_status,'confirmed_by_name',confirmed_name,'linked_reservation',linked_reservation,'handover',handover);
END $function$;

REVOKE ALL ON FUNCTION public.private_group_read_snapshot(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_snapshot(uuid,text,uuid,text) TO anon,authenticated,service_role;

-- 個別通知の宛先判定に使用。通常のチャット本文（JSONでないもの）も保持する。
CREATE OR REPLACE FUNCTION public.private_group_message_payload(p_message text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
 RETURN p_message::jsonb;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.private_group_message_payload(text) FROM PUBLIC,anon,authenticated;

-- 段階 2（20261010100000）で 返信先・削除・ピン留め・写真の枚数と縦横 を足した
CREATE OR REPLACE FUNCTION public.private_group_read_messages(p_group_id uuid, p_member_id uuid DEFAULT NULL::uuid, p_guest_token text DEFAULT NULL::text, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE access_level text; own_members uuid[];
BEGIN
 access_level:=public.authorize_private_group_read(p_group_id,p_member_id,p_guest_token);
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO own_members FROM public.private_group_members
 WHERE group_id=p_group_id AND user_id=auth.uid() AND status='joined';
 IF p_member_id IS NOT NULL AND NOT (p_member_id=ANY(own_members)) THEN
  BEGIN
   PERFORM public.require_private_group_member(p_group_id,p_member_id,p_guest_token);
   own_members:=array_append(own_members,p_member_id);
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
  RAISE EXCEPTION '履歴の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id) FROM (
  SELECT id,group_id,member_id,CASE WHEN deleted_at IS NULL THEN message ELSE '' END AS message,created_at,sender_type,
   reply_to_message_id,deleted_at,pinned_at,
   CASE WHEN deleted_at IS NULL THEN (SELECT jsonb_agg(jsonb_build_object('position',p.position,'width',p.width,'height',p.height) ORDER BY p.position)
     FROM public.private_group_message_photos p WHERE p.message_id=m.id) END AS photos
  FROM public.private_group_messages m
  WHERE group_id=p_group_id
   AND (access_level='staff' OR coalesce(public.private_group_message_payload(m.message)->>'action','')<>'individual_notice'
    OR public.private_group_message_payload(m.message)->>'target_member_id'=ANY(own_members::text[])
    OR (auth.uid() IS NOT NULL AND public.private_group_message_payload(m.message)->>'target_user_id'=auth.uid()::text))
   AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) m),'[]'::jsonb);
END $function$;
REVOKE ALL ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_group_read_messages(uuid,uuid,text,timestamptz,uuid,integer) TO anon,authenticated,service_role;

-- UUIDカーソルで全件を辿り、PostgRESTの既定件数制限で一覧を欠落させない。
CREATE OR REPLACE FUNCTION public.private_group_read_list(
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

-- 貸切予約管理の一覧用。グループの必要な項目だけを返す（#835、migration 20261005100000）
CREATE OR REPLACE FUNCTION public.private_group_read_staff_booking_summaries(p_organization_id uuid, p_group_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); actor_role text; actor_org uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 IF p_organization_id IS NULL OR p_group_ids IS NULL OR cardinality(p_group_ids)>1000 THEN
  RAISE EXCEPTION '一覧の取得条件が正しくありません' USING ERRCODE='22023';
 END IF;
 SELECT role::text,organization_id INTO actor_role,actor_org FROM public.users WHERE id=actor;
 IF NOT (
  COALESCE(actor_role='license_admin',false) OR
  (COALESCE(actor_role IN ('admin','staff') AND actor_org=p_organization_id,false)
   AND NOT (EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org)
    AND NOT EXISTS(SELECT 1 FROM public.staff WHERE user_id=actor AND organization_id=actor_org AND (status IS NULL OR status NOT IN ('inactive','resigned')))))
 ) THEN RAISE EXCEPTION 'この組織の一覧を閲覧できません' USING ERRCODE='42501'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',g.id,'scenario_master_id',g.scenario_master_id,'invite_code',g.invite_code,
  'joined_member_count',(SELECT count(*) FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined'),
  'candidate_dates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'group_id',d.group_id,'date',d.date,'time_slot',d.time_slot,'start_time',d.start_time,'end_time',d.end_time,'status',d.status
   ) ORDER BY d.order_num,d.id) FROM public.private_group_candidate_dates d WHERE d.group_id=g.id AND d.withdrawn_at IS NULL),'[]'::jsonb)
 ) ORDER BY g.id) FROM public.private_groups g WHERE g.organization_id=p_organization_id AND g.id=ANY(p_group_ids)),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.private_group_read_staff_booking_summaries(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.private_group_read_staff_booking_summaries(uuid,uuid[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.private_group_read_reservation(p_reservation_id uuid)
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

CREATE OR REPLACE FUNCTION public.private_group_read_survey_responses(p_group_id uuid)
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
