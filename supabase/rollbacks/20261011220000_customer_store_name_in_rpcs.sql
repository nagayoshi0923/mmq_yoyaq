-- 20261011220000 の取り消し: 各関数を staging の元の定義に戻し、customer_store_name を消す。
BEGIN;

-- get_private_group_schedules
CREATE OR REPLACE FUNCTION public.get_private_group_schedules(p_group_ids uuid[])
 RETURNS TABLE(group_id uuid, requested_datetime text, store_id uuid, store_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pg.id::uuid AS group_id,
    r.requested_datetime::text,
    r.store_id::uuid,
    s.name::text AS store_name
  FROM private_groups pg
  JOIN reservations r ON r.id = pg.reservation_id
  LEFT JOIN stores s ON s.id = r.store_id
  WHERE pg.id = ANY(p_group_ids)
    AND (
      -- グループメンバー（参加済み）
      EXISTS (
        SELECT 1 FROM private_group_members pgm
        WHERE pgm.group_id = pg.id
          AND pgm.user_id = auth.uid()
          AND pgm.status = 'joined'
      )
      -- その組織のスタッフ・管理者（同じ組織のお客様は含めない。2026-10-06）
      OR (public.is_staff_or_admin() AND pg.organization_id = public.get_user_organization_id())
      -- マスター
      OR public.is_platform_master()
    );
END;
$function$;

-- private_group_performance_info
CREATE OR REPLACE FUNCTION public.private_group_performance_info(p_group uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('reservation_id', r.id, 'date', e.date, 'start_time', e.start_time, 'end_time', e.end_time,
    'store_name', coalesce(s.name, e.venue), 'participant_count', r.participant_count,
    'ended', (r.status = 'completed' OR ((e.date + coalesce(e.end_time, e.start_time, time '23:59')) AT TIME ZONE 'Asia/Tokyo') <= p_now))
  FROM public.private_groups g
  JOIN public.reservations r ON r.id = g.reservation_id AND r.organization_id = g.organization_id
  JOIN public.schedule_events e ON e.id = r.schedule_event_id AND e.organization_id = g.organization_id
  LEFT JOIN public.stores s ON s.id = e.store_id AND s.organization_id = g.organization_id
  WHERE g.id = p_group AND g.status <> 'cancelled' AND r.status IN ('confirmed', 'checked_in', 'completed')
    AND NOT coalesce(e.is_cancelled, false)
$function$;

-- private_group_handover_detail
CREATE OR REPLACE FUNCTION public.private_group_handover_detail(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE h public.private_group_handover_requests%ROWTYPE; g public.private_groups%ROWTYPE; res public.reservations%ROWTYPE;
 has_res boolean:=false; v_reservation jsonb; v_members jsonb; v_dates jsonb; v_scenario jsonb; v_contact jsonb; v_confirmed jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインが必要です' USING ERRCODE='42501'; END IF;
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 IF NOT FOUND OR NOT (auth.uid() IN (h.from_user_id,h.to_user_id) OR public.reservation_actor_is_org_operator(h.organization_id)) THEN
  RAISE EXCEPTION '引き継ぎの依頼が見つかりません' USING ERRCODE='42501';
 END IF;
 PERFORM public.private_group_handover_settle(h.group_id);
 SELECT * INTO h FROM public.private_group_handover_requests WHERE id=p_request_id;
 SELECT * INTO g FROM public.private_groups WHERE id=h.group_id;
 SELECT jsonb_build_object('title',s.title,'key_visual_url',s.key_visual_url) INTO v_scenario FROM public.scenario_masters s WHERE s.id=g.scenario_master_id;
 SELECT * INTO res FROM public.reservations
  WHERE (id=g.reservation_id OR private_group_id=g.id) AND organization_id=g.organization_id AND status<>'cancelled'
  ORDER BY (id=g.reservation_id) DESC, created_at DESC LIMIT 1;
 has_res:=FOUND;
 IF has_res THEN
  SELECT jsonb_build_object('date',e.date,'start_time',e.start_time,'end_time',e.end_time,'store_id',e.store_id,'store_name',COALESCE(s.name,e.venue))
   INTO v_confirmed
  FROM public.schedule_events e LEFT JOIN public.stores s ON s.id=e.store_id AND s.organization_id=g.organization_id
  WHERE e.id=res.schedule_event_id AND e.organization_id=g.organization_id AND res.status IN ('confirmed','checked_in','completed') AND NOT COALESCE(e.is_cancelled,false);
  v_reservation:=jsonb_build_object('id',res.id,'reservation_number',res.reservation_number,'status',res.status,
   'participant_count',res.participant_count,'total_price',res.total_price,'customer_name',res.customer_name,'store_id',res.store_id,
   'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('date',c->>'date','startTime',c->>'startTime','endTime',c->>'endTime') ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'candidates')='array' THEN res.candidate_datetimes->'candidates' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(c,ord)),'[]'::jsonb),
   'requested_store_ids',COALESCE((SELECT jsonb_agg(st->>'storeId' ORDER BY ord)
     FROM jsonb_array_elements(CASE WHEN jsonb_typeof(res.candidate_datetimes->'requestedStores')='array' THEN res.candidate_datetimes->'requestedStores' ELSE '[]'::jsonb END) WITH ORDINALITY AS u(st,ord)
     WHERE nullif(st->>'storeId','') IS NOT NULL),'[]'::jsonb),
   'confirmed',v_confirmed,
   'policy',CASE WHEN res.cancellation_policy_snapshot_version=1 AND res.cancellation_policy_store_id IS NOT NULL THEN jsonb_build_object(
     'version',res.cancellation_policy_snapshot_version,'store_id',res.cancellation_policy_store_id,
     'store_name',(SELECT s.name FROM public.stores s WHERE s.id=res.cancellation_policy_store_id AND s.organization_id=g.organization_id),
     'performance_type',res.cancellation_policy_performance_type,'deadline_hours',res.cancellation_policy_deadline_hours,
     'fees',res.cancellation_policy_fees,'fee_basis',res.cancellation_policy_fee_basis,'updated_at',res.cancellation_policy_updated_at) END);
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,
   'name',CASE WHEN m.user_id IS NULL THEN coalesce(nullif(btrim(m.guest_name),''),'ゲスト') ELSE coalesce((SELECT coalesce(nullif(c.nickname,''),nullif(c.name,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1),nullif(btrim(m.guest_name),''),'メンバー') END,
   'is_organizer',m.is_organizer,'is_guest',m.user_id IS NULL,'is_me',m.user_id IS NOT NULL AND m.user_id=auth.uid()) ORDER BY m.is_organizer DESC,m.joined_at,m.id),'[]'::jsonb)
  INTO v_members FROM public.private_group_members m WHERE m.group_id=g.id AND m.status='joined';
 SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d.date,'time_slot',d.time_slot,'start_time',d.start_time,'end_time',d.end_time) ORDER BY d.order_num,d.id),'[]'::jsonb)
  INTO v_dates FROM public.private_group_candidate_dates d WHERE d.group_id=g.id AND d.status IS DISTINCT FROM 'rejected' AND d.withdrawn_at IS NULL;
 IF auth.uid()=h.to_user_id THEN
  -- 連絡先の初期値（本人の顧客情報。共通〔組織なし〕かこのグループと同じ組織のもの）
  SELECT jsonb_build_object('name',c.name,'phone',c.phone,'email',coalesce(nullif(c.email,''),(SELECT u.email FROM auth.users u WHERE u.id=auth.uid())))
   INTO v_contact FROM public.customers c
   WHERE c.user_id=auth.uid() AND (c.organization_id IS NULL OR c.organization_id=g.organization_id)
   ORDER BY (c.organization_id IS NULL) DESC, c.updated_at DESC NULLS LAST, c.id LIMIT 1;
  IF v_contact IS NULL THEN
   v_contact:=jsonb_build_object('name',NULL,'phone',NULL,'email',(SELECT u.email FROM auth.users u WHERE u.id=auth.uid()));
  END IF;
 END IF;
 RETURN jsonb_build_object(
  'request',jsonb_build_object('id',h.id,'status',h.status,'requested_at',h.requested_at,'expires_at',h.expires_at,'responded_at',h.responded_at,
   'from_name',public.private_group_handover_user_name(h.from_user_id,g.id),'to_name',public.private_group_handover_user_name(h.to_user_id,g.id),
   'is_recipient',auth.uid()=h.to_user_id,'is_requester',auth.uid()=h.from_user_id),
  'group',jsonb_build_object('id',g.id,'status',g.status,'invite_code',g.invite_code,'organization_id',g.organization_id,
   'organization_slug',(SELECT o.slug FROM public.organizations o WHERE o.id=g.organization_id),
   'scenario_master_id',g.scenario_master_id,'preferred_store_ids',to_jsonb(g.preferred_store_ids),
   'total_price',g.total_price,'per_person_price',g.per_person_price,'target_participant_count',g.target_participant_count),
  'scenario',v_scenario,'reservation',v_reservation,'members',v_members,'candidate_dates',v_dates,'my_contact',v_contact);
END $function$;

-- private_group_read_snapshot
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

-- customer_notice_on_reminder_sent
CREATE OR REPLACE FUNCTION public.customer_notice_on_reminder_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.reservations%ROWTYPE; e record; v_user uuid; v_title text;
BEGIN
 BEGIN
  SELECT * INTO r FROM public.reservations WHERE id=NEW.reservation_id AND organization_id=NEW.organization_id;
  IF NOT FOUND OR r.customer_id IS NULL THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user FROM public.customers WHERE id=r.customer_id;
  SELECT ev.date, ev.start_time, coalesce(st.name, ev.venue) AS venue INTO e
    FROM public.schedule_events ev LEFT JOIN public.stores st ON st.id=ev.store_id WHERE ev.id=NEW.schedule_event_id;
  v_title := CASE NEW.days_before WHEN 0 THEN '本日の公演のご案内' WHEN 1 THEN '明日の公演のご案内' ELSE NEW.days_before||'日後の公演のご案内' END;
  PERFORM public.customer_notice_bell(v_user,r.customer_id,r.organization_id,'reservation_reminder','reminder','reminder:'||NEW.id::text,v_title,
   format('「%s」%s%s。ご来店をお待ちしております。',public.customer_notice_work_title(coalesce(r.title,'')),
    coalesce(' '||public.customer_notice_when(e.date,e.start_time)||'開演',''),coalesce('（'||e.venue||'）','')),
   public.customer_notice_reservation_link(r),r.id,NEW.schedule_event_id,
   jsonb_build_object('reservation_number',r.reservation_number,'days_before',NEW.days_before));
 EXCEPTION WHEN others THEN
  RAISE WARNING 'customer_notice_on_reminder_sent failed: %', SQLERRM;
 END;
 RETURN NULL;
END $function$;

-- enqueue_private_approval_deliveries
CREATE OR REPLACE FUNCTION public.enqueue_private_approval_deliveries(p_request_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET row_security TO 'off'
AS $function$
DECLARE
 receipt public.private_booking_approval_requests%ROWTYPE;
 r public.reservations%ROWTYPE; e public.schedule_events%ROWTYPE; s public.staff%ROWTYPE;
 booking jsonb; gm_ids uuid[]; gm_id uuid; recipient text; recipient_name text; job_count integer;
 store_name text; store_address text;
 actor_staff_id uuid; actor_name text; event_snapshot jsonb;
BEGIN
 SELECT * INTO STRICT receipt FROM public.private_booking_approval_requests WHERE id=p_request_id;
 SELECT * INTO STRICT r FROM public.reservations WHERE id=receipt.reservation_id AND organization_id=receipt.organization_id;
 SELECT * INTO STRICT e FROM public.schedule_events
  WHERE id=(receipt.result->>'schedule_event_id')::uuid AND organization_id=receipt.organization_id;
 IF r.schedule_event_id IS DISTINCT FROM e.id OR e.is_cancelled IS DISTINCT FROM false
  OR r.status NOT IN ('confirmed','gm_confirmed') THEN
  RAISE EXCEPTION 'APPROVAL_NOTIFICATION_NOT_CURRENT' USING ERRCODE='22023';
 END IF;
 SELECT name,address INTO STRICT store_name,store_address FROM public.stores
  WHERE id=e.store_id AND organization_id=receipt.organization_id;
 recipient:=nullif(btrim(r.customer_email),''); recipient_name:=coalesce(nullif(r.customer_name,''),'お客様');
 IF recipient IS NULL AND r.customer_id IS NOT NULL THEN
  SELECT nullif(btrim(c.email),''),coalesce(nullif(c.name,''),recipient_name) INTO recipient,recipient_name
   FROM public.customers c WHERE c.id=r.customer_id AND (c.organization_id=r.organization_id OR c.organization_id IS NULL);
 END IF;
 booking:=jsonb_build_object(
  'reservationId',r.id,'organizationId',r.organization_id,'scheduleEventId',e.id,'storeId',e.store_id,
  'scenarioMasterId',coalesce(e.scenario_master_id,r.scenario_master_id),'scenarioTitle',coalesce(nullif(e.scenario,''),r.scenario_title,''),
  'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,'storeName',store_name,'storeAddress',store_address,
  'customerEmail',recipient,'customerName',coalesce(recipient_name,'お客様'),'participantCount',r.participant_count,
  'totalPrice',coalesce(r.final_price,r.total_price,0),'reservationNumber',r.reservation_number,'notes',r.customer_notes,
  'groupId',r.private_group_id,'eventGms',to_jsonb(e.gms));
 INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
 VALUES(receipt.id,r.organization_id,r.id,e.id,'confirmation_email','customer',booking);
 gm_ids:=array_remove(ARRAY[(receipt.request_payload->>'gm')::uuid,(receipt.request_payload->>'sub_gm')::uuid],NULL);
 FOR gm_id IN SELECT DISTINCT unnest(gm_ids) LOOP
  SELECT * INTO STRICT s FROM public.staff WHERE id=gm_id AND organization_id=r.organization_id AND status='active';
  IF NOT coalesce(s.name=ANY(e.gms),false) THEN RAISE EXCEPTION 'APPROVAL_GM_NOT_ASSIGNED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.private_booking_approval_deliveries(request_id,organization_id,reservation_id,schedule_event_id,kind,recipient_key,snapshot)
  SELECT receipt.id,r.organization_id,r.id,e.id,kind,s.id::text,
   booking||jsonb_build_object('gmId',s.id,'gmName',s.name,'gmEmail',nullif(btrim(s.email),''),
    'gmDiscordChannelId',nullif(btrim(s.discord_channel_id),''),'gmDiscordUserId',nullif(btrim(s.discord_user_id),''))
  FROM unnest(ARRAY['gm_email','gm_discord']) AS kind;
 END LOOP;
 SELECT id,name INTO actor_staff_id,actor_name FROM public.staff
  WHERE user_id=receipt.actor_id AND organization_id=r.organization_id AND status='active';
 SELECT jsonb_object_agg(key,value) INTO event_snapshot FROM jsonb_each(to_jsonb(e))
  WHERE key IN ('id','organization_id','date','venue','store_id','scenario','scenario_master_id','gms','gm_roles',
   'start_time','end_time','category','capacity','max_participants','current_participants','notes','is_cancelled',
   'is_tentative','is_reservation_enabled','is_private_request','reservation_name','time_slot','venue_rental_fee');
 INSERT INTO public.schedule_event_history(schedule_event_id,organization_id,event_date,store_id,time_slot,
  changed_by_user_id,changed_by_staff_id,changed_by_name,action_type,new_values,notes)
 VALUES(e.id,r.organization_id,e.date,e.store_id,e.time_slot,receipt.actor_id,actor_staff_id,
  coalesce(actor_name,'管理者')||'（貸切管理）','create',event_snapshot,'貸切予約承認により作成');
 SELECT count(*) INTO job_count FROM public.private_booking_approval_deliveries WHERE request_id=receipt.id;
 RETURN job_count;
END $function$;

-- approve_private_booking_with_notice
CREATE OR REPLACE FUNCTION public.approve_private_booking_with_notice(p_reservation_id uuid, p_selected_date date, p_selected_start_time time without time zone, p_selected_end_time time without time zone, p_selected_store_id uuid, p_selected_gm_id uuid, p_candidate_datetimes jsonb, p_scenario_title text, p_customer_name text, p_selected_sub_gm_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE event_id uuid; r record; g record; e record; settings record;
 member_id uuid; survey_message_id uuid; survey jsonb; survey_message text; survey_action text; deadline_text text := '';
BEGIN
 event_id:=public.approve_private_booking(p_reservation_id,p_selected_date,p_selected_start_time,
 p_selected_end_time,p_selected_store_id,p_selected_gm_id,p_candidate_datetimes,
 p_scenario_title,p_customer_name,p_selected_sub_gm_id);
 SELECT * INTO STRICT r FROM reservations WHERE id=p_reservation_id;
 IF r.private_group_id IS NULL THEN
   RETURN jsonb_build_object('schedule_event_id',event_id,'survey_notice',NULL);
 END IF;
 SELECT * INTO g FROM private_groups WHERE id=r.private_group_id AND organization_id=r.organization_id FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_ORGANIZATION_MISMATCH' USING ERRCODE='P0050';
 END IF;
 IF g.reservation_id IS DISTINCT FROM r.id THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_RESERVATION_MISMATCH' USING ERRCODE='P0051';
 END IF;
 SELECT se.*,s.name AS store_name INTO STRICT e FROM schedule_events se
 JOIN stores s ON s.id=se.store_id AND s.organization_id=se.organization_id
 WHERE se.id=event_id AND se.organization_id=r.organization_id;
 SELECT system_msg_schedule_confirmed_title,system_msg_schedule_confirmed_body,pre_reading_notice_message
 INTO settings FROM global_settings WHERE organization_id=r.organization_id;
 SELECT m.id INTO member_id FROM private_group_members m
 WHERE m.group_id=g.id AND m.is_organizer AND m.user_id=g.organizer_id ORDER BY m.id LIMIT 1;
 INSERT INTO private_group_messages(group_id,member_id,message) VALUES(g.id,member_id,
 jsonb_build_object('type','system','action','schedule_confirmed','confirmedDate',e.date,
 'confirmedTimeSlot',COALESCE(NULLIF(e.time_slot,''),to_char(e.start_time,'HH24:MI')||'〜'||to_char(e.end_time,'HH24:MI')),
 'storeName',e.store_name,'title',COALESCE(NULLIF(settings.system_msg_schedule_confirmed_title,''),'日程が確定いたしました'),
 'body',COALESCE(NULLIF(settings.system_msg_schedule_confirmed_body,''),'ご予約ありがとうございます。当日のご来店をお待ちしております。'))::text);
 survey:=public.freeze_private_group_survey_deadline(r.organization_id,g.id);
 IF survey->>'error' IS NOT NULL THEN
   RAISE EXCEPTION 'PRIVATE_GROUP_SURVEY_CONFIGURATION_INVALID' USING ERRCODE='P0052';
 END IF;
 IF COALESCE((survey->>'survey_enabled')::boolean,false) THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(survey->'characters','[]'::jsonb)) c
             WHERE NOT COALESCE((c->>'is_npc')::boolean,false)) AND NULLIF(survey->>'survey_url','') IS NULL THEN
     survey_action:='pre_reading_notice';
     survey_message:=COALESCE(NULLIF(settings.pre_reading_notice_message,''),E'【ご確認ください】\n\nこのシナリオには事前配役アンケートがございます。\n\n公演日までに参加者全員がこのグループに参加している必要があります。まだ参加されていない方がいらっしゃいましたら、招待リンクを共有してグループへの参加をお願いいたします。\n\nご不明点がございましたら、店舗までお問い合わせください。');
   ELSE
     survey_action:='survey_notice';
     IF survey->>'survey_deadline_at' IS NOT NULL THEN
       deadline_text:=E'\n\n回答期限: '||to_char((survey->>'survey_deadline_at')::timestamptz AT TIME ZONE 'Asia/Tokyo','FMMM/FMDD')||'まで';
     END IF;
     survey_message:=E'【事前配役アンケートのご協力のお願い】\n\nこちらの公演では事前配役アンケートへのご回答をお願いしております。\n\n'||
       CASE WHEN NULLIF(survey->>'survey_url','') IS NOT NULL THEN E'次のURLからアンケートにお答えください。\n'||(survey->>'survey_url')
       ELSE '上記の「日程を確認・回答する」ボタンからアンケートにお答えください。' END||deadline_text||E'\n\nご不明点がございましたら、お気軽にお問い合わせください。';
   END IF;
   INSERT INTO private_group_messages(group_id,member_id,message) VALUES(g.id,member_id,
     jsonb_build_object('type','system','action',survey_action,'message',survey_message)::text) RETURNING id INTO survey_message_id;
 END IF;
 RETURN jsonb_build_object('schedule_event_id',event_id,'survey_notice',survey_message,'survey_message_id',survey_message_id);
END $function$;

-- capture_waitlist_notice_event
CREATE OR REPLACE FUNCTION public.capture_waitlist_notice_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE before_count integer; after_count integer; e public.schedule_events; s public.stores;
BEGIN
 -- 完了/無断欠席/任意の非有効状態は取消として扱わない。
 IF NOT ((OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.status='cancelled')
 OR (OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') AND NEW.participant_count<OLD.participant_count)) THEN RETURN NEW; END IF;
 before_count:=CASE WHEN OLD.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN OLD.participant_count ELSE 0 END;
 after_count:=CASE WHEN NEW.status IN ('pending','confirmed','gm_confirmed','checked_in') THEN NEW.participant_count ELSE 0 END;
 IF before_count<=after_count OR NEW.schedule_event_id IS NULL OR NEW.schedule_event_id IS DISTINCT FROM OLD.schedule_event_id THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.schedule_events WHERE id=NEW.schedule_event_id AND organization_id=NEW.organization_id;
 IF e.id IS NULL OR coalesce(e.is_cancelled,false) OR ((e.date+coalesce(e.end_time,e.start_time)+CASE WHEN e.end_time<e.start_time THEN interval '1 day' ELSE interval '0 days' END) AT TIME ZONE 'Asia/Tokyo')<=now() THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.stores WHERE id=e.store_id AND organization_id=e.organization_id;
 INSERT INTO public.waitlist_notice_events(organization_id,schedule_event_id,reservation_id,actor_user_id,freed_seats,metadata)
 VALUES(e.organization_id,e.id,NEW.id,auth.uid(),before_count-after_count,jsonb_build_object(
 'scenarioTitle',e.scenario,'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,
 'storeName',coalesce(s.name,e.venue,''),'storeAddress',coalesce(s.address,'')));
 RETURN NEW;
END $function$;

-- claim_private_group_survey_reminders
CREATE OR REPLACE FUNCTION public.claim_private_group_survey_reminders(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, organization_id uuid, kind text, to_email text, to_name text, scenario_title text, performance_date date, start_time time without time zone, venue text, deadline_at timestamp with time zone, invite_code text, company_name text, reply_to text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.private_group_survey_reminders q SET status='skipped', last_error='answered_before_send', lease_until=NULL
   WHERE q.status='pending' AND q.kind<>'preview'
     AND EXISTS (SELECT 1 FROM public.private_group_survey_responses x WHERE x.member_id=q.member_id AND x.group_id=q.group_id);
  RETURN QUERY
  WITH picked AS (
    SELECT q.id FROM public.private_group_survey_reminders q
     WHERE (q.status='pending' OR (q.status='sending' AND q.lease_until<clock_timestamp())) AND q.next_attempt_at<=clock_timestamp() AND q.attempt_count<5
     ORDER BY q.next_attempt_at, q.id LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),50) FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE public.private_group_survey_reminders q SET status='sending', attempt_count=q.attempt_count+1, lease_until=clock_timestamp()+interval '10 minutes'
      FROM picked WHERE q.id=picked.id RETURNING q.*
  )
  SELECT l.id, l.organization_id, l.kind,
         COALESCE(l.to_email_override, NULLIF(pii.guest_email,''), au.email)::text,
         COALESCE(CASE WHEN m.user_id IS NULL THEN pii.guest_name END,
                  (SELECT COALESCE(NULLIF(c.name,''),NULLIF(c.nickname,'')) FROM public.customers c WHERE c.user_id=m.user_id ORDER BY c.id LIMIT 1), 'お客')::text,
         sm.title::text, e.date, e.start_time, st.name::text, l.deadline_at, g.invite_code::text,
         COALESCE(NULLIF(es.company_name,''), NULLIF(eo.company_name,''), 'クインズワルツ')::text,
         -- 返信先: 組織の返信先 → 会場の店舗の連絡先 → 組織共通の連絡先（普段のリマインドメールと同じ順）
         COALESCE(NULLIF(os.reply_to_email,''), NULLIF(es.company_email,''), NULLIF(eo.company_email,''))::text
    FROM leased l
    JOIN public.private_group_members m ON m.id=l.member_id
    JOIN public.private_groups g ON g.id=l.group_id
    LEFT JOIN public.private_group_members_pii pii ON pii.member_id=m.id
    LEFT JOIN auth.users au ON au.id=m.user_id
    LEFT JOIN public.scenario_masters sm ON sm.id=g.scenario_master_id
    LEFT JOIN public.reservations r ON r.id=g.reservation_id
    LEFT JOIN public.schedule_events e ON e.id=r.schedule_event_id
    LEFT JOIN public.stores st ON st.id=e.store_id
    LEFT JOIN public.email_settings es ON es.organization_id=l.organization_id AND es.store_id=e.store_id
    LEFT JOIN public.email_settings eo ON eo.organization_id=l.organization_id AND eo.store_id IS NULL
    LEFT JOIN public.organization_settings os ON os.organization_id=l.organization_id;
END $function$;

-- compensated_cancellation
CREATE OR REPLACE FUNCTION public.compensated_cancellation(p_event_id uuid, p_apply boolean DEFAULT false, p_expected jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_bodies jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.schedule_events; c public.coupon_campaigns; v_org uuid; v_actor uuid:=auth.uid();
  v_start timestamptz; v_days integer; v_amount integer; v_count integer; v_rows jsonb;
  v_snapshot jsonb; item jsonb; v_result jsonb; v_token text; v_text text; v_exp timestamptz;
  v_store text; v_ids jsonb; v_quantity integer; v_campaigns uuid[];
BEGIN
  SELECT organization_id INTO v_org FROM public.users WHERE id=v_actor AND role IN ('admin','staff','license_admin');
  IF v_org IS NULL OR NOT (public.is_org_admin() OR EXISTS(SELECT 1 FROM public.staff WHERE user_id=v_actor AND organization_id=v_org AND status='active')) THEN
    RAISE EXCEPTION 'スタッフ権限を確認できません'; END IF;
  SELECT * INTO e FROM public.schedule_events WHERE id=p_event_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '公演を確認できません'; END IF;
  IF EXISTS(SELECT 1 FROM public.compensated_cancellations WHERE event_id=e.id AND organization_id=v_org) THEN
    SELECT jsonb_agg(reservation_id ORDER BY reservation_id) INTO v_ids FROM public.compensated_cancellation_notices WHERE event_id=e.id;
    RETURN jsonb_build_object('already_completed',true,'reservation_ids',v_ids);
  END IF;
  IF e.is_cancelled OR e.category NOT IN ('open','private') OR
    (e.scenario_id IS NULL AND e.scenario_master_id IS NULL AND e.organization_scenario_id IS NULL) THEN
    RAISE EXCEPTION '開催予定のマーダーミステリー公演を選択してください'; END IF;
  v_start:=coalesce(e.start_at,(e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo');
  v_days:=(v_start AT TIME ZONE 'Asia/Tokyo')::date-(now() AT TIME ZONE 'Asia/Tokyo')::date;
  v_amount:=CASE WHEN v_days=0 AND v_start>=now() THEN CASE WHEN v_start-now()<=interval '2 hours' THEN 5000 ELSE 2000 END WHEN v_days=1 THEN 1000 END;
  IF v_amount IS NULL THEN RAISE EXCEPTION 'この時期の補償額は未確定です。個別に確認してください'; END IF;
  SELECT array_agg(id) INTO v_campaigns FROM public.coupon_campaigns
    WHERE organization_id=v_org AND is_active AND name LIKE '店舗都合中止のお詫び｜%'
      AND discount_type='fixed' AND discount_amount=v_amount AND coupon_expiry_months=6
      AND murder_mystery_only AND trigger_type='manual' AND max_uses_per_customer=1;
  IF cardinality(v_campaigns) IS DISTINCT FROM 1 THEN RAISE EXCEPTION '補償用クーポンを1種類に特定できません'; END IF;
  SELECT * INTO c FROM public.coupon_campaigns WHERE id=v_campaigns[1] FOR SHARE;
  PERFORM 1 FROM public.reservations WHERE schedule_event_id=e.id AND organization_id=v_org ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('id',r.id,'customer_id',r.customer_id,
    'name',coalesce(cu.name,r.customer_name),'email',coalesce(nullif(r.customer_email,''),cu.email),
    'quantity',r.participant_count,'status',r.status,'updated_at',r.updated_at,
    'reservation_number',r.reservation_number,'total_price',r.total_price,'user_id',cu.user_id) ORDER BY r.id)
  INTO v_rows FROM public.reservations r LEFT JOIN public.customers cu ON cu.id=r.customer_id
  WHERE r.schedule_event_id=e.id AND r.organization_id=v_org AND r.status<>'cancelled';
  IF v_rows IS NULL THEN RAISE EXCEPTION '参加予定の予約がありません'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    IF item->>'status' NOT IN ('confirmed','gm_confirmed','checked_in') OR
      coalesce((item->>'quantity')::integer,0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '未確定の予約または人数を確認してください'; END IF;
    IF nullif(item->>'email','') IS NULL THEN RAISE EXCEPTION 'メールアドレス未登録の予約があります'; END IF;
    IF e.category='open' AND item->>'user_id' IS NULL THEN RAISE EXCEPTION '予約者のMMQアカウントを確認してください'; END IF;
    IF nullif(p_bodies->>(item->>'id'),'') IS NULL AND p_apply THEN RAISE EXCEPTION '全対象者のメール本文を確認してください'; END IF;
  END LOOP;
  v_snapshot:=jsonb_build_object('event_id',e.id,'category',e.category,'start',v_start,'event_updated_at',e.updated_at,
    'amount',v_amount,'campaign_id',c.id,'coupon_name',coalesce(c.display_name,c.name),'recipients',v_rows);
  IF NOT p_apply THEN RETURN jsonb_build_object('already_completed',false,'snapshot',v_snapshot); END IF;
  IF p_expected IS DISTINCT FROM v_snapshot THEN RAISE EXCEPTION '予約や補償額が変わりました。中止画面を開き直してください'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION '中止理由を入力してください'; END IF;
  SELECT name INTO v_store FROM public.stores WHERE id=e.store_id;
  INSERT INTO public.compensated_cancellations(event_id,organization_id,created_by,snapshot) VALUES(e.id,v_org,v_actor,v_snapshot);
  UPDATE public.schedule_events SET is_cancelled=true,cancelled_at=now(),cancellation_reason=p_reason,updated_at=now() WHERE id=e.id;
  FOR item IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    PERFORM public.cancel_reservation_with_lock((item->>'id')::uuid,(item->>'customer_id')::uuid,p_reason);
    IF e.category='private' THEN
      UPDATE public.private_groups SET status='cancelled',updated_at=now()
        WHERE id=(SELECT private_group_id FROM public.reservations WHERE id=(item->>'id')::uuid);
      v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
      INSERT INTO public.private_coupon_claim_links(organization_id,reservation_id,event_id,campaign_id,token,discount_amount,max_claims,created_by)
        VALUES(v_org,(item->>'id')::uuid,e.id,c.id,v_token,v_amount,(item->>'quantity')::integer,v_actor)
        RETURNING expires_at INTO v_exp;
      v_text:=format(E'■ お詫びクーポン\n%s\n参加予定のお客様1人につき1枚、各自のMMQアカウントでお受け取りください。\n受け取りURL：https://mmq.game/coupon-claim#%s\n受け取り期限：%s（発行から3か月）\nクーポンの有効期限：受け取った日から6か月。実際の期限は受け取り画面で確認できます。',coalesce(c.display_name,c.name),v_token,to_char(v_exp AT TIME ZONE 'Asia/Tokyo','YYYY/MM/DD HH24:MI'));
    ELSE
      v_result:=public.grant_representative_compensation(v_org,(item->>'id')::uuid,v_actor,false,NULL);
      v_result:=public.grant_representative_compensation(v_org,(item->>'id')::uuid,v_actor,true,v_result->'snapshot');
      v_text:=format(E'■ お詫びクーポン\n%s × %s枚を予約者様のアカウントへ付与しました。\n有効期限：%s（付与から6か月）\nマイページ：https://mmq.game/mypage',coalesce(c.display_name,c.name),item->>'quantity',to_char((v_result->>'expires_at')::timestamptz AT TIME ZONE 'Asia/Tokyo','YYYY/MM/DD HH24:MI'));
    END IF;
    v_text:=v_text||E'\n対象：マーダーミステリーの通常公演・貸切。作品制限はありません。ボードゲーム・箱開け会には利用できません。';
    INSERT INTO public.compensated_cancellation_notices(reservation_id,event_id,organization_id,compensation_text,payload)
    VALUES((item->>'id')::uuid,e.id,v_org,v_text,jsonb_build_object(
      'organizationId',v_org,'storeId',e.store_id,'reservationId',item->>'id','customerEmail',item->>'email',
      'customerName',item->>'name','scenarioTitle',e.scenario,'eventDate',e.date,'startTime',e.start_time,'endTime',e.end_time,
      'storeName',v_store,'participantCount',(item->>'quantity')::integer,'totalPrice',item->'total_price',
      'reservationNumber',item->>'reservation_number','cancelledBy','store','cancellationReason',p_reason,
      'customEmailBody',p_bodies->>(item->>'id')));
  END LOOP;
  SELECT jsonb_agg(reservation_id ORDER BY reservation_id) INTO v_ids FROM public.compensated_cancellation_notices WHERE event_id=e.id;
  RETURN jsonb_build_object('already_completed',false,'reservation_ids',v_ids);
END;
$function$;

-- get_public_cancellation_policy_for_context
CREATE OR REPLACE FUNCTION public.get_public_cancellation_policy_for_context(p_organization_slug text, p_store_id uuid, p_scenario_master_id uuid, p_event_id uuid)
 RETURNS TABLE(organization_id uuid, organization_slug text, organization_name text, store_id uuid, store_name text, store_short_name text, is_configured boolean, cancellation_policy text, cancellation_policy_items jsonb, cancellation_deadline_hours integer, cancellation_fees jsonb, cancellation_fee_basis text, private_cancellation_policy text, private_cancellation_policy_items jsonb, private_cancellation_deadline_hours integer, private_cancellation_fees jsonb, private_cancellation_fee_basis text, organizer_cancel_reasons jsonb, organizer_cancel_refund_note text, cancellation_judgment_rules jsonb, cancellation_notice_note text, reservation_change_deadline_hours integer, reservation_change_note text, private_reservation_change_deadline_hours integer, private_reservation_change_note text, refund_method_note text, policy_updated_at date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    o.id AS organization_id,
    o.slug::TEXT AS organization_slug,
    o.name::TEXT AS organization_name,
    s.id AS store_id,
    s.name::TEXT AS store_name,
    s.short_name::TEXT AS store_short_name,
    (rs.id IS NOT NULL OR changes.updated_at IS NOT NULL) AS is_configured,
    (public.resolve_operating_setting(o.id, 'cancellation_policy', to_jsonb(rs.cancellation_policy), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_policy_items', to_jsonb(rs.cancellation_policy_items), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_deadline_hours', to_jsonb(rs.cancellation_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_fees', to_jsonb(rs.cancellation_fees), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_fee_basis', to_jsonb(rs.cancellation_fee_basis), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'private_cancellation_policy', to_jsonb(rs.private_cancellation_policy), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'private_cancellation_policy_items', to_jsonb(rs.private_cancellation_policy_items), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'private_cancellation_deadline_hours', to_jsonb(rs.private_cancellation_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    NULLIF(public.resolve_operating_setting(o.id, 'private_cancellation_fees', to_jsonb(rs.private_cancellation_fees), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'private_cancellation_fee_basis', to_jsonb(rs.private_cancellation_fee_basis), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'organizer_cancel_reasons', to_jsonb(rs.organizer_cancel_reasons), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'organizer_cancel_refund_note', to_jsonb(rs.organizer_cancel_refund_note), s.id, os.id, ev.id)->>'value')::text,
    NULLIF(public.resolve_operating_setting(o.id, 'cancellation_judgment_rules', to_jsonb(rs.cancellation_judgment_rules), s.id, os.id, ev.id)->'value', 'null'::jsonb),
    (public.resolve_operating_setting(o.id, 'cancellation_notice_note', to_jsonb(rs.cancellation_notice_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'reservation_change_deadline_hours', to_jsonb(rs.reservation_change_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    (public.resolve_operating_setting(o.id, 'reservation_change_note', to_jsonb(rs.reservation_change_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'private_reservation_change_deadline_hours', to_jsonb(rs.private_reservation_change_deadline_hours), s.id, os.id, ev.id)->>'value')::integer,
    (public.resolve_operating_setting(o.id, 'private_reservation_change_note', to_jsonb(rs.private_reservation_change_note), s.id, os.id, ev.id)->>'value')::text,
    (public.resolve_operating_setting(o.id, 'refund_method_note', to_jsonb(rs.refund_method_note), s.id, os.id, ev.id)->>'value')::text,
    GREATEST(rs.policy_updated_at, (changes.updated_at AT TIME ZONE 'Asia/Tokyo')::date)
  FROM public.organizations o
  INNER JOIN public.stores s
    ON s.organization_id = o.id
   AND s.status = 'active'
  LEFT JOIN public.reservation_settings rs
    ON rs.store_id = s.id
   AND rs.organization_id = o.id
  LEFT JOIN public.schedule_events ev ON ev.id = p_event_id AND ev.organization_id = o.id AND ev.store_id = s.id
    AND COALESCE(ev.is_cancelled, false) = false
  LEFT JOIN public.organization_scenarios os ON os.organization_id = o.id
    AND CASE WHEN p_event_id IS NOT NULL THEN
      (os.id = ev.organization_scenario_id OR (ev.organization_scenario_id IS NULL AND os.scenario_master_id = COALESCE(ev.scenario_master_id, ev.scenario_id)))
      ELSE os.scenario_master_id = p_scenario_master_id END
  LEFT JOIN LATERAL (
    SELECT max(v.updated_at) AS updated_at FROM public.operating_setting_overrides v
    WHERE v.organization_id = o.id AND v.settings ?| ARRAY['cancellation_policy','cancellation_policy_items','cancellation_deadline_hours','cancellation_fees','cancellation_fee_basis','private_cancellation_policy','private_cancellation_policy_items','private_cancellation_deadline_hours','private_cancellation_fees','private_cancellation_fee_basis','organizer_cancel_reasons','organizer_cancel_refund_note','cancellation_judgment_rules','cancellation_notice_note','reservation_change_deadline_hours','reservation_change_note','private_reservation_change_deadline_hours','private_reservation_change_note','refund_method_note']
      AND ((v.store_id IS NULL AND v.organization_scenario_id IS NULL AND v.schedule_event_id IS NULL)
        OR v.store_id = s.id OR v.organization_scenario_id = os.id OR v.schedule_event_id = ev.id)
  ) changes ON true
  WHERE o.slug = p_organization_slug
    AND o.is_active = TRUE
    AND o.booking_site_status = 'approved'
    AND (p_store_id IS NULL OR s.id = p_store_id)
    AND (p_event_id IS NULL OR ev.id IS NOT NULL)
    AND (p_scenario_master_id IS NULL OR os.scenario_master_id = p_scenario_master_id)
  ORDER BY s.display_order NULLS LAST, s.name, s.id;
$function$;

DROP FUNCTION IF EXISTS public.customer_store_name(uuid, date, text);

COMMIT;
